///////////////////////////////////////////////////////////////////////////////
////
/// GpuPort.cpp - Node.js add-on to use GPU as a 24-bit parallel port
// primary purpose: drive 24 channels of WS281X pixels from a RPi
//
//This is a Node.js add-on to display a rectangular grid of pixels (a texture) on screen using FB (fallback to SDL2) and hardware acceleration (via GPU).
//In essence, the RPi GPU provides a 24-bit parallel output port with precision timing (pixels).
//Optionally, OpenGL and GLSL shaders can be used for generating effects.
//In dev mode (on XWindows), an SDL window is used.  In live mode, full screen (frame buffer) is used (must first be configured for desired resolution).
//Each color bit of the VGA signal generates a separate data stream, hence the screen behaves like a 24-bit parallel output port.
//Without external mux, there can be 24 "universes" of external LEDs controlled (one by each VGA bit).  Since the GPU uses multiple pixels to draw each WS281X bit, a h/w mux can be used to handle significantly more LEDs.
//Number of transitions per row (screen columns) determines #data bits for the LEDs (24 needed for each WS281X pixel).
//Screen height determines max universe length (at least 1 WS281X per line when using 24 display columns).
//
//Copyright (c) 2015-2020 Don Julien, djulien@thejuliens.net
//
//RPi setup:
//  install dpi24 and set dpi_timings in /boot/config.txt
//  ls -l /dev/fb0
//  groups  #which groups am i a member of
//  usermod -aG video "$USER"  #add user to group
//**need to log out and back in or "su username -"; see https://unix.stackexchange.com/questions/277240/usermod-a-g-group-user-not-work
//
//to install:
//  npm install  #installs SDL2; otherwise, must be manually installed
//  -or-  git clone (this repo), then cd into it
//
//to build+test as Node.js add-on:
//  npm install --verbose  -or-  npm run build  -or-  node-gyp rebuild --verbose
//  npm test
//to build+test as stand-alone:
//  make  #GpuPort
//  [sudo]  ./build/GpuPort  #on RPi, "sudo" needed unless member of video group
//
//to debug:
//  compile first
//  gdb -tui node; run ../; layout split
//OBSOLETE-to get core files:
// https://stackoverflow.com/questions/2065912/core-dumped-but-core-file-is-not-in-current-directory
// echo "[main]\nunpackaged=true" > ~/.config/apport/settings
// core files end up in /var/crash
// mkdir ~/.core-files
// rm -f  ~/.core-files/*; apport-unpack /var/crash/* ~/.core-files   #makes them readable by gdb
// load into gdb:  gdb ./unittest ~/.core-files/CoreDump
//
//WS281X notes:
//30 usec = 33.3 KHz node rate
//1.25 usec = 800 KHz bit rate; x3 = 2.4 MHz data rate => .417 usec
//AC SSRs:
//120 Hz = 8.3 msec; x256 ~= 32.5 usec (close enough to 30 usec); OR x200 = .0417 usec == 10x WS281X data rate
//~ 1 phase angle dimming time slot per WS281X node
//invert output
//2.7 Mbps serial date rate = SPBRG 2+1
//8+1+1 bits = 3x WS281X data rate; 3 bytes/WS281X node
//10 serial bits compressed into 8 WS281X data bits => 2/3 reliable, 1/3 unreliable bits
//5 serial bits => SPBRG 5+1, 1.35 Mbps; okay since need to encode anyway?
///////////////////////////////////////////////////////////////////////////////


//TODO: trim this down:
#include <unistd.h> //sleep(), usleep()
#include <stdlib.h> //env?, mem?
//#include <math.h>
//#include <inttypes.h>
//#include <cstdio> //length()
//#include <string>
#include <cstring> //strerror()
#include <cerrno> //errno, strerror()
#include <memory> //memset(), //std::shared_ptr<>
#include <type_traits> //std::remove_cvref<>, std::decay<>, std::remove_reference<>, std::remove_pointer<>, std::conditional<>, std::if_same<>, enable_if<>, is_same<>, const_cast<>
#include <cstdint> //uint32_t etc
#include <clocale> //setlocale()
#include <stdexcept> //std::out_of_range()
#include <utility> //std::as_const()
#include <stdio.h> //printf(), open(), close()
//#include <string.h> //snprintf()
//#include <ctype.h> //isxdigit()
//#include <sys/stat.h> //struct stat
#include <cstdint> //uint32_t
#include <sstream> //std::ostringstream
//#include <memory.h> //memmove()
#include <algorithm> //std::min<>(), std::max<>()

//#ifdef NODE_GYP_MODULE_NAME
// #pragma message("compiled as Node.js add-on")
//#else
// #pragma message("compiled for stand-alone usage")
//#endif

//#if __cplusplus < 201400L
// #pragma message("CAUTION: this file probably needs c++14 or later to compile correctly")
//#endif
#if __cplusplus < 201703L
 #error "sorry, need c++17 to compile"
//#else
// #pragma message("okay, using C++ " TOSTR(__cplusplus))
#endif


///////////////////////////////////////////////////////////////////////////////
////
/// helper macros
//

//compile-time length of array:
#define SIZEOF(thing)  (sizeof(thing) / sizeof((thing)[0]))

//should use "static" but compiler doesn't like it:
#define STATIC  //static

//left/right shift:
#define shiftlr(val, pos)  (((pos) < 0)? ((val) << -(pos)): ((val) >> (pos)))

//min/max:
#define MIN(a, b)  (((a) < (b))? (a): (b))
#define MAX(a, b)  (((a) > (b))? (a): (b))

//kludge: compiler doesn't like "return (void)expr" so fake it
#define RETURN(...) { __VA_ARGS__; return; }

#define multiple(num, den)  ((num) - (num) % (den))

//convert to string + force inner macro expansion:
#ifndef TOSTR
 #define TOSTR(str)  TOSTR_NESTED(str)
 #define TOSTR_NESTED(str)  #str //kludge: need nested level to force expansion
#endif


//perfect forwarding:
#define PERF_FWD(from, to)  \
template <typename ... ARGS>  \
/*decltype(to(ARGS&& ... args))*/ auto from(ARGS&& ... args) { return to(std::forward<ARGS>(args) ...); }


//kludge: "!this" no worky with g++ on RPi??
//#ifndef isnull
// #ifdef __ARMEL__ //RPi //__arm__
//  #define isnull(ptr)  ((ptr) < reinterpret_cast<decltype(ptr)>(2)) //kludge: "!this" no worky with g++ on RPi; this !< 1 and != 0, but is < 2 so use that
// #else //PC
//  #define isnull(ptr)  !(ptr)
// #endif
//#endif


//clamp byte:
//limit to range 0..0xFF
#define clamp_1ARG(val)  clamp_2ARGS(val, 0xFF) //((val) & 0xFF)
//#define clamp_2ARGS(val, shift)  clamp_3ARGS(val, shift, 0xFF)
#define clamp_2ARGS(val, limit)  MIN(limit, MAX(0, val)) //clamp_3ARGS(val, limit, 0)
#define clamp_3ARGS(val, limit, shift_bits)  MIN(limit, MAX(0, shiftlr(val, shift_bits)))
#define clamp(...)  UPTO_3ARGS(__VA_ARGS__, clamp_3ARGS, clamp_2ARGS, clamp_1ARG) (__VA_ARGS__)

//mask/wrap byte:
#define cbyte_1ARG(val)  ((val) & 0xFF)
#define cbyte_2ARGS(val, shift)  cbyte_3ARGS(val, shift, 0xFF)
#define cbyte_3ARGS(val, shift, mask)  (shiftlr(val, shift) & (mask))
#define cbyte(...)  UPTO_3ARGS(__VA_ARGS__, cbyte_3ARGS, cbyte_2ARGS, cbyte_1ARG) (__VA_ARGS__)


//debug helpers:
//#define debug(msg)  printf(BLUE_MSG msg ENDCOLOR_ATLINE)
static int prevout = true; //don't need to start with newline
#define debug_1ARG(msg)  prevout = printf("\n" BLUE_MSG msg ENDCOLOR_ATLINE + (prevout > 0))
#define debug_GE2ARGS(msg, ...)  prevout = printf("\n" BLUE_MSG msg ENDCOLOR_ATLINE + (prevout > 0), __VA_ARGS__)
#define debug(...)  UPTO_16ARGS(__VA_ARGS__, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_GE2ARGS, debug_1ARG) (__VA_ARGS__)

#define fatal_1ARG(msg)  (fprintf(stderr, "\n" RED_MSG "FATAL: " msg ENDCOLOR_ATLINE + (prevout > 0)), exit(1))
#define fatal_GE2ARGS(msg, ...)  (fprintf(stderr, "\n" RED_MSG "FATAL: " msg ENDCOLOR_ATLINE + (prevout > 0), __VA_ARGS__), exit(1))
#define fatal(...)  UPTO_16ARGS(__VA_ARGS__, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_GE2ARGS, fatal_1ARG) (__VA_ARGS__)

//#define errmsg(msg, ...)  fprintf(stderr, RED_MSG msg ENDCOLOR_ATLINE, __VA_ARGS__)
//#define warn(msg, ...)  fprintf(stderr, YELLOW_MSG msg ENDCOLOR_ATLINE, __VA_ARGS__)
#define SRCLINE  "  @" __FILE__ ":" TOSTR(__LINE__)
//#define ATLINE(...)  __VA_ARGS__  SRCLINE //append src line# to last arg


//variable #macro args:
#ifndef UPTO_1ARG
 #define UPTO_1ARG(skip1, keep2, ...)  keep2
#endif
#ifndef UPTO_2ARGS
 #define UPTO_2ARGS(skip1, skip2, keep3, ...)  keep3
#endif
#ifndef UPTO_3ARGS
 #define UPTO_3ARGS(skip1, skip2, skip3, keep4, ...)  keep4
#endif
#ifndef UPTO_4ARGS
 #define UPTO_4ARGS(skip1, skip2, skip3, skip4, keep5, ...)  keep5
#endif
#ifndef UPTO_16ARGS
 #define UPTO_16ARGS(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16, keep17, ...)  keep17
#endif
//#define STATIC_WRAP_2ARGS(TYPE, VAR)  STATIC_WRAP_3ARGS(TYPE, VAR, INIT_NONE) //optional third param
//#define STATIC_WRAP(...)  UPTO_3ARGS(__VA_ARGS__, STATIC_WRAP_3ARGS, STATIC_WRAP_2ARGS, STATIC_WRAP_1ARG) (__VA_ARGS__)
//#define STATIC_WRAP  STATIC_WRAP_3ARGS


///////////////////////////////////////////////////////////////////////////////
////
/// color definitions
//

//ANSI color codes (for console output):
//https://en.wikipedia.org/wiki/ANSI_escape_code
#define ANSI_COLOR(code)  "\x1b[" code "m"
//#define ANSI_COLOR(code)  std::ostringstream("\x1b[" code "m")
//use bright variants:
#define RED_MSG  ANSI_COLOR("1;31") //too dark: "0;31"
#define GREEN_MSG  ANSI_COLOR("1;32")
#define YELLOW_MSG  ANSI_COLOR("1;33")
#define BLUE_MSG  ANSI_COLOR("1;34")
#define MAGENTA_MSG  ANSI_COLOR("1;35")
#define PINK_MSG  MAGENTA_MSG //easier to spell :)
#define CYAN_MSG  ANSI_COLOR("1;36")
#define GRAY_MSG  ANSI_COLOR("0;37") //use dim; bright is too close to white
#define ENDCOLOR_NOLINE  ANSI_COLOR("0")
#define ENDCOLOR_NEWLINE  ENDCOLOR_NOLINE "\n"
#define ENDCOLOR_ATLINE  SRCLINE ENDCOLOR_NEWLINE


//primary RGB colors:
//colors have 2 formats (byte orders): internal and external
//external format is used by caller and is always ARGB
//internal format is used by FB and byte order can vary by platform
//below are external consts for use by caller
#if 1 //use constexpr so compiler can optimize usage
constexpr uint32_t RED = 0xFFff0000;
constexpr uint32_t GREEN = 0xFF00ff00;
constexpr uint32_t BLUE = 0xFF0000ff;
constexpr uint32_t YELLOW = 0xFFffff00;
constexpr uint32_t CYAN = 0xFF00ffff;
constexpr uint32_t MAGENTA = 0xFFff00ff;
constexpr uint32_t WHITE = 0xFFffffff;
constexpr uint32_t WARM_WHITE = 0xFFffffb4; //h 60/360, s 30/100, v 1.0 //try to simulate incandescent
constexpr uint32_t COOL_WHITE = 0xFFccccff;
constexpr uint32_t BLACK = 0xFF000000; //NOTE: still needs alpha
constexpr uint32_t XPARENT = 0; //no alpha
//dim values; easier on eyes during long debug sessions:
constexpr uint32_t RED_low = 0xFF1f0000;
constexpr uint32_t GREEN_low = 0xFF001f00;
constexpr uint32_t BLUE_low = 0xFF00001f;
constexpr uint32_t YELLOW_low = 0xFF1f1f00;
constexpr uint32_t CYAN_low = 0xFF001f1f;
constexpr uint32_t MAGENTA_low = 0xFF1f001f;
constexpr uint32_t WHITE_low = 0xFF1f1f1f;
#else //macros can expand in unexpected places; don't use
#define RED  0xFFff0000
#define GREEN  0xFF00ff00
#define BLUE  0xFF0000ff
#define YELLOW  0xFFffff00
#define CYAN  0xFF00ffff
#define MAGENTA  0xFFff00ff
#define WHITE  0xFFffffff
#define WARM_WHITE  0xFFffff99 //0xFFffffb4 //h 60/360, s 30/100, v 1.0
#define COOL_WHITE  0xFF9999ff
#define BLACK  0xFF000000 //NOTE: all off still needs alpha
#define XPARENT  0 //no alpha

#define RED_low  0xFF1f0000
#define GREEN_low  0xFF001f00
#define BLUE_low  0xFF00001f
#define YELLOW_low  0xFF1f1f00
#define CYAN_low  0xFF001f1f
#define MAGENTA_low  0xFF1f001f
#define WHITE_low  0xFF1f1f1f
#endif


//get color components:
//uses external (caller-visible) byte order (ARGB)
#define A(color)  cbyte(color, 24) //(((color) >> 24) & 0xFF) //Ashift)
#define R(color)  cbyte(color, 16) //(((color) >> 16) & 0xFF) //Rshift)
#define G(color)  cbyte(color, 8) //(((color) >> 8) & 0xFF) //Gshift)
#define B(color)  cbyte(color, 0) //(((color) >> 0) & 0xFF) //Bshift)
#define R_G_B_A(color)  R(color), G(color), B(color), A(color)
#define A_R_G_B(color)  A(color), R(color), G(color), B(color)
#define brightness(color)  (R(color) + G(color) + B(color))

#define Abits(color)  ((color) & 0xFF000000) //cbyte(color, -24) //-Ashift)
#define RGBbits(color)  ((color) & 0x00FFFFFF) //((color) & ~ABITS(0xFFffffff))
#define Rbits(color)  ((color) & 0x00FF0000) //cbyte(color, -16) //-Rshift)
#define Gbits(color)  ((color) & 0x0000FF00) //cbyte(color, -8) //-Gshift)
#define Bbits(color)  ((color) & 0x000000FF) //cbyte(color, -0) //-Bshift)


//auto-limit brightness:
//212 == 83% limit; max 60 => 50 mA / LED
//170 == 67% limit; max 60 => 40 mA / LED
//128 == 50% limit: max 60 => 30 mA / LED
#ifdef LIMIT_BRIGHTNESS
 #define auto_dim(color)  MIN(LIMIT_BRIGHTNESS / brightness(color), 1)
// #define LIMIT(color)  ((auto_dim(color) < 1)? toARGB(A(color), R(color) * auto_dim(color), G(color) * auto_dim(color), B(color) * auto_dim(color)): (color))
 #define LIMIT(color)  toARGB(A(color), R(color) * auto_dim(color), G(color) * auto_dim(color), B(color) * auto_dim(color))
#else
 #define LIMIT(color)  (color)
#endif


#define color_t  uint32_t
#if 0 //NOT NEEDED?  seems to work with SDL/Intel and FB/RPi as-is
//internal color byte order:
//external (caller) byte order always ARGB notation
//internal (FB) byte order depends on endianness; RPi wants BGRA
//use macros to xlate colors in/out of FB order
#if 1
 #pragma message(CYAN_MSG "Intel byte order: RGBA (hard-coded)" ENDCOLOR_NOLINE)
 #define A_shift 24
 #define R_shift 16
 #define G_shift 8
 #define B_shift 0
#elif 1 //RPi
 #pragma message(CYAN_MSG "RPi byte order: AGRB (hard-coded)" ENDCOLOR_NOLINE)
//TODO: figure out why byte order is strange on RPi
//NOTE: this doesn't matter anyway with pivot24; just swap channels/wires to fix
 #define A_shift 24
 #define R_shift 8
 #define G_shift 16
 #define B_shift 0
#elif defined(__BIG_ENDIAN__) || (defined(__BYTE_ORDER) && (__BYTE_ORDER == __BIG_ENDIAN))
// || defined(__ARMEB__) || defined(__THUMBEB__) || defined(__AARCH64EB__) || defined(_MIBSEB) || defined(__MIBSEB) || defined(__MIBSEB__)
 #pragma message(CYAN_MSG "big endian (risc?)" ENDCOLOR_NOLINE)
 #define A_shift 24
 #define R_shift 16
 #define G_shift 8
 #define B_shift 0
#elif defined(__LITTLE_ENDIAN__) || (defined(__BYTE_ORDER) && (__BYTE_ORDER == __LITTLE_ENDIAN))
// || defined(__ARMEL__) || defined(__THUMBEL__) || defined(__AARCH64EL__) || defined(_MIPSEL) || defined(__MIPSEL) || defined(__MIPSEL__)
 #pragma message(CYAN_MSG "little endian (RPi, Intel)" ENDCOLOR_NOLINE)
 #define A_shift 0
 #define R_shift 8
 #define G_shift 16
 #define B_shift 24
#else
 #error RED_MSG "Unknown endianness." ENDCOLOR_NOLINE
#endif


//convert from external (caller) ARGB order to internal (FB) order:
#define fromARGB_1ARG(argb)  fromARGB_4ARGS(Abits(argb)? A(argb): /*RGBbits(argb)? 0xFF: 0*/ 0xFF, R(argb), G(argb), B(argb)) //conditional full alpha
#define fromARGB_2ARGS(a, rgb)  fromARGB_4ARGS(a, R(rgb), G(rgb), B(rgb))
#define fromARGB_3ARGS(r, g, b)  fromARGB_4ARGS(0xFF, r, g, b) //default full alpha
#define fromARGB_4ARGS(a, r, g, b)  ((clamp(a) << A_shift) | (clamp(r) << R_shift) | (clamp(g) << G_shift) | (clamp(b) << B_shift))
#define fromARGB(...)  UPTO_4ARGS(__VA_ARGS__, fromARGB_4ARGS, fromARGB_3ARGS, fromARGB_2ARGS, fromARGB_1ARG) (__VA_ARGS__)

//convert back to external (caller) ARGB order from internal (FB) order:
#define toARGB_1ARG(color)  (Abits(shiftlr(color, A_shift - 24)) | Rbits(shiftlr(color, R_shift - 16)) | Gbits(shiftlr(color, G_shift - 8)) | Bbits(shiftlr(color, B_shift - 0)))
#define toARGB_4ARGS(a, r, g, b)  ((clamp(a) << 24) | (clamp(r) << 16) | (clamp(g) << 8) | (clamp(b) << 0))
#define toARGB(...)  UPTO_4ARGS(__VA_ARGS__, toARGB_4ARGS, toARGB_3ARGS, toARGB_2ARGS, toARGB_1ARG) (__VA_ARGS__)


//color struct:
//for portability, caller can use separate A/R/G/B when constructing colors
//otherwise, caller uses external ARGB order
//using this struct remembers corrected byte order for internal use
//internal RPi FB order is actually BGRA?
/*class*/ struct color_t //: public uint32_t
{
//members:
//    uint8_t a, r, g, b; 
    uint32_t uint32; //stored in FB preferred byte order (BGRA on RPi)
public: //ctors/dtors:
//converts external to internal byte order
    color_t(): uint32(0) {} //color_t(0) {} //uint32(m_uint32), m_uint32(0) {} //no alpha
    color_t(uint32_t argb): /*uint32(m_uint32),*/ uint32(fromARGB(argb)) {} //argb_t(argb >> 24, argb >> 16, argb >> 8, argb >> 0) {};
    color_t(uint8_t r, uint8_t g, uint8_t b): uint32(fromARGB(r, g, b)) {} //color_t(fromARGB(r, g, b)) {} //uint32(m_uint32), //argb_t(255, r, g, b) {}; //default full alpha
    color_t(uint8_t a, uint8_t r, uint8_t g, uint8_t b): uint32(fromARGB(a, r, g, b)) {} //color_t(fromARGB(a, r, g, b)) {} //uint32(m_uint32)
    color_t(const color_t& other): /*uint32(m_uint32),*/ uint32(other.uint32) {} //copy ctor; no byte swapping
//helpers:
//    uint8 A() const { return}
//operators:
//https://stackoverflow.com/questions/51615363/how-to-write-c-getters-and-setters
//    const uint32_t& uint32() const { return(m_uint32); } // = m_uint32;
//    operator int() const { return(m_uint32); }
//    operator uint32_t() const { return(m_uint32); } //toARGB(m_argb)); }
    color_t& operator=(const color_t& other) { uint32 = other.uint32; return *this; }
//not needed- pre-convert primary RGB colors to internal format:
//only useful one is BLACK (for clearing screen)
//    static const color_t BLACK; //(::BLACK); //A_R_G_B(::BLACK));
//    static const color_t RED(::RED); //A_R_G_B(::RED));
//    static const color_t GREEN(::GREEN); //A_R_G_B(::GREEN));
//    static const color_t BLUE(::BLUE); //A_R_G_B(::BLUE));
//    static const color_t YELLOW(::YELLOW); //A_R_G_B(::YELLOW));
//    static const color_t CYAN(::CYAN); //A_R_G_B(::CYAN));
//    static const color_t MAGENTA(::MAGENTA); //A_R_G_B(::MAGENTA));
//    static const color_t WHITE(::WHITE); //A_R_G_B(::WHITE));
//    static const color_t WARM_WHITE(::WARM_WHITE); //A_R_G_B(::WARM_WHITE));
//    static const color_t COOL_WHITE(::COOL_WHITE); //A_R_G_B(::COOL_WHITE));
};
//const color_t color_t::BLACK(::BLACK); //A_R_G_B(::BLACK));
#endif


///////////////////////////////////////////////////////////////////////////////
////
/// helper functions
//

#include <sys/time.h> //struct timeval, struct timezone
#include <time.h> //struct timespec
#include <stdio.h>
#include <stdarg.h> //va_list, va_start(), va_end()
#include <sys/stat.h> //struct stat
#include <limits> //std::numeric_limits<>
#include <SDL.h>

static const char* dummy = setlocale(LC_ALL, ""); //enable commas in printf using "%'d"

#if __cplusplus < 201100L
 #pragma message(YELLOW_MSG "CAUTION: this file probably needs c++11 or later to compile correctly" ENDCOLOR_NOLINE)
#endif


//convert time struct to msec:
//just use built-in struct; don't need high-precsion?
//NOTE: returns value relative to first time; allows smaller data size
/*long*/ int time2msec(struct timeval* tv) 
{
//CAUTION: * clamps on RPi?; use smaller intermediate results to avoid
//    constexpr long YEAR_SEC = 365 * 24 * 60 * 60; //#sec/year; use to trim system time to smaller value
//    static long int started = 0;
    static auto started = tv->tv_sec - 1; //relative to first time called
    /*long*/ int msec = (tv->tv_sec - started) * 1e3 + tv->tv_usec / 1e3; //"int" won't wrap for relative times
//decltype(started) sv_st = started;
//    if (!started) started = msec - 1; //make result non-0
//debug("started %ld, sec %ld + usec %ld => msec %ld", started, tv->tv_sec, tv->tv_usec, msec);
//    msec -= started; //relative to first time called
//    static int limit = std::numeric_limits<decltype(time2msec(tv))>::max();
//    if (msec > limit) fatal("rel time too big: %ld (max %d)", msec, limit);
    return msec;
}
/*long*/ int time2msec()
{
    struct timeval timeval;
    struct timezone& tz = *(struct timezone*)0; //relative times don't need this
    if (gettimeofday(&timeval, &tz)) fatal("gettimeofday %p", &tz);
    return time2msec(&timeval);
}


//turn null ptr into empty str:
const char* nvl(const char* str, const char* null = 0)
{
    return str? str: null? null: "";
}


//check for file existence:
bool fexists(const char* path)
{
    struct stat info;
    return !stat(path, &info); //file exists
}


//in-line err msg:
//adds SDL or stdio error text to caller-supplied msg
#define errmsg(...)  _errmsg(SRCLINE, __VA_ARGS__) //capture caller's line# for easier debug
int _errmsg(const char* srcline, const char* desc, ...) //ARGS&& ... args)
{
    static bool isroot = !geteuid(); //(getuid() == geteuid()); //0 == root
//TODO: getgrouplist() to check if member of video group?
    constexpr const char* try_sudo = " Try \"sudo\"?"; //std::string try_sudo(" Try \"sudo\".");
    constexpr int msglen = strlen(try_sudo); //try_sudo.length
    const char* reason = errno? std::strerror(errno): nvl(SDL_GetError(), "(SDL error)");
    errno = 0; (void)SDL_ClearError(); //reset after reported
    char fmt[256]; //composite msg fmt string
//    static int isdup = 0;
    static char prevfmt[sizeof(fmt)] = {0};
    snprintf(fmt, sizeof(fmt), "\n" RED_MSG "%s error: %s.%s%s" ENDCOLOR_NEWLINE, desc, reason, &try_sudo[isroot? msglen: 0], srcline);
    strcpy(fmt + sizeof(fmt) - 4, "..."); //truncation indicator
    isroot = true; //just suggest sudo on first message
    if (!strcmp(prevfmt, fmt)) //dup (probably); check includes line#, but *not* incl values
    {
        int now = time2msec();
        if ((prevout > 0) || (now + prevout > 1e3)) //show dups 1x/sec
        {
            fprintf(stderr, RED_MSG "." ENDCOLOR_NOLINE); //concise repeat indicator
            prevout = -now; //(prev_outlen > 0)? 0: prev_outlen - 1; //isdup = 1; //next non-dup msg will need to start with line break
        }
//        else fprintf(stderr, RED_MSG ".%'d" ENDCOLOR_NOLINE, now + prevout);
        return(0); //cast to RETTYPE
    }
//    if (prev_outlen) isdup = 0;
    strcpy(prevfmt, fmt);
    va_list args;
    va_start (args, desc);
//        vsnprintf(previous, )
    prevout = vfprintf(stderr, fmt + (prevout > 0), args); //Vargs(desc).args);
    va_end(args);
    return(0); //cast to RETTYPE
}
//perfect forward to above for different retvals/types:
//use "long" to avoid loss of precision with ptrs
template <typename ... ARGS, typename RETTYPE = long>
RETTYPE _errmsg(const char* srcline, RETTYPE retval, const char* desc, ARGS&& ... args)
{
    _errmsg(srcline, desc, std::forward<ARGS>(args) ...);    
    return retval;
}


///////////////////////////////////////////////////////////////////////////////
////
/// frame buffer I/O
//

//2 scenarios are supported:
//- on XWindows (RPi or dev PC, maybe ssh); use SDL (XWindows) to simulate full screen
//- bare console; use full screen with FB device (faster than SDL2/OpenGL?); perf needed on RPi

#include <unistd.h> //open(), close()
#include <stdio.h> //close()
#include <cstdio> //sscanf
#include <fcntl.h> //open(), O_RDWR
#include <sys/ioctl.h> //ioctl()
#include <linux/fb.h> //FBIO_*, struct fb_var_screeninfo, fb_fix_screeninfo
#include <sys/mman.h> //mmap()
#include <stdexcept> //out_of_range

#ifdef HAS_SDL
//https://wiki.libsdl.org/CategoryAPI
#if 1
//#include <SDL.h>
#define SDL_OK(retval)  ((retval) >= 0) //((SDL_LastError = (retval)) >= 0)
// #pragma message(CYAN_MSG "assuming libSDL2 is installed" ENDCOLOR_NOLINE)
#else //TODO?
//SDL retval conventions:
//0 == Success, < 0 == error, > 0 == data ptr (sometimes)
#define SDL_Success  0
#define SDL_OtherError  -2 //arbitrary; anything < 0
int SDL_LastError = SDL_Success; //remember last error (mainly for debug msgs)
//use overloaded function to handle different SDL retval types:
//#define SDL_OK(retval)  ((SDL_LastError = (retval)) >= 0)
inline bool SDL_OK(int errcode)
{
    return ((SDL_LastError = errcode) >= 0);
}
template <typename ... ARGS> //perfect fwd
inline bool SDL_OK(SDL_bool ok, ARGS&& ... why)
{
    return SDL_OK((ok == SDL_TRUE)? SDL_Success: SDL_SetError(std::forward<ARGS>(why) ...));
}
inline bool SDL_OK(void* ptr) //SDL error text already set; just use dummy value for err code
{
    return SDL_OK(ptr? SDL_Success: SDL_OtherError);
}
//#define SDL_exc_1ARG(what_failed)  error(what_failed, SRCLINE)
//#define SDL_exc_2ARGS(what_failed, srcline)  error(what_failed, ifnull(srcline, SRCLINE))
//#define SDL_exc_3ARGS(what_failed, want_throw, srcline)  ((want_throw)? error(what_failed, ifnull(srcline, SRCLINE)): debug(SDL_LEVEL, what_failed, ifnull(srcline, SRCLINE)))
//#define SDL_exc(...)  UPTO_3ARGS(__VA_ARGS__, SDL_exc_3ARGS, SDL_exc_2ARGS, SDL_exc_1ARG) (__VA_ARGS__)
#endif
#endif //def HAS_SDL


//FB low-level I/O:
//2 scenarios:
//- if XWindows is running, emulate FB using SDL window
//- if running in console, use FB/stdio
//NOTE: caller always sees ARGB byte order; FB class will swap byte order internally if needed
#define LAZY_TEXTURE //don't create until caller uses pixels
class FBIO
{
//check for XWindows, DEFER TO Std FB functions:
//FB not working with XWindows (also tried xorg FB driver) :(
//    /*static*/ const /*bool*/int isXWindows = (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
//    constexpr const int DDIRTY = 2; //true; //double buffer requires 2 repaints? (1x/buffer)
    /*bool*/ int m_dirty; //= false;
public:
    static const /*bool*/int isXWindows; //= (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
    static const int isRPi;
public: //ctors/dtors
    inline bool dirty() const { return !!m_dirty; }
//TODO?    void dirty(int now_dirty) { m_dirty = now_dirty; } //custom dirty repaint
    inline void dirty(bool now_dirty) { m_dirty = now_dirty? 2: 0; } //compensate for double buffering
#ifdef HAS_SDL
 #pragma message(CYAN_MSG "using SDL2 to emulate FB" ENDCOLOR_NOLINE)
    FBIO(): sdl_window(sdl_window), sdl_mode(sdl_mode), sdl_renderer(sdl_renderer), sdl_texture(sdl_texture), m_pixels(m_pixels), m_dirty(m_dirty) //kludge: need to satisfy compiler, but avoid overwriting already-initialized data
    {
        debug("FBIO ctor %lu:%'d x %lu:%'d, wnd %lu:%p, rend %lu:%p, txtr %lu:%p, px %lu:%p, dirty %lu:%d", sizeof(sdl_mode.w), sdl_mode.w, sizeof(sdl_mode.h), sdl_mode.h, sizeof(sdl_window), sdl_window, sizeof(sdl_renderer), sdl_renderer, sizeof(sdl_texture), sdl_texture, sizeof(m_pixels), m_pixels, sizeof(m_dirty), m_dirty); //, &sdl_mode);
    }
protected: //SDL not working with FB, so emulate it here  :(
    static const int FAKED_FD() { return 1234; } //CAUTION: use static method to avoid init order problem (fb_open needs this value)
    SDL_Window* sdl_window; //= 0;
    SDL_DisplayMode sdl_mode; //= {0}; //CAUTION: do not re-init after calling FB delegated ctor
    SDL_Renderer* sdl_renderer; //= 0;
    SDL_Texture* sdl_texture; //= 0;
    uint32_t* m_pixels; //= 0;
    template <typename ... ARGS>
    int fb_open(ARGS&& ... args)
    {
debug("fb_open");
//        memset(&sdl_mode, 0, sizeof(sdl_mode)); //must be init before calling delegated ctor
        debug("fb_open: isXWindows? %lu:0x%x, Disp '%s', !xW? %lu:0x%x", sizeof(isXWindows), (int)isXWindows, nvl(getenv("DISPLAY"), "(none)"), sizeof(!isXWindows), !(int)isXWindows); //, sizeof(broken_isXWindows));
        if (!isXWindows)
        {
            m_dirty = 0;
            memset(&sdl_mode, 0, sizeof(sdl_mode)); //kludge: init for !isXWindows case
            int op = open(std::forward<ARGS>(args) ...); //perfect forward
            struct fb_var_screeninfo vdata;
            if ((op > 0) && (ioctl(op, FBIOGET_VSCREENINFO, &vdata) >= 0))
            {
                sdl_mode.w = vdata.xres;
                sdl_mode.h = vdata.yres;
            }
            return op;
        }
        debug("!try sdl? 0x%x ... using SDL on XW", !isXWindows);
        SDL_Init(SDL_INIT_VIDEO);
        SDL_SetHint(SDL_HINT_RENDER_VSYNC, "1"); //use video sync to avoid tear
        SDL_SetHint(SDL_HINT_RENDER_DRIVER, "RPI"); //in case RPI is not first on list
        int dispinx = 0; //default first screen
        sscanf(nvl(getenv("DISPLAY"), ":0"), ":%d", &dispinx); //) dispinx = 0; //default first screen
//        static int once = 0;
//        if (!once++)
//        {
        debug("#disp: %d, #modes: %d", SDL_GetNumVideoDisplays(), SDL_GetNumDisplayModes(dispinx));
        for (int i = 0, limit = SDL_GetNumVideoDrivers(); i < limit; ++i)
            debug("video driver[%d/%d]: '%s'", i, limit, SDL_GetVideoDriver(i));
        SDL_Rect r = {0};
        if (!SDL_OK(SDL_GetDisplayBounds(0, &r))) return errmsg("SDL_GetDisplayBounds");
        debug("disp rect: (%'d, %'d), (%'d, %'d)", r.x, r.y, r.w, r.h);
//        }
        dirty(false);
//        SDL_DisplayMode mode;
        if (!SDL_OK(SDL_GetCurrentDisplayMode(dispinx, &sdl_mode))) return errmsg("SDL_GetDisplayMode [%d]", dispinx);
        debug("video drvr '%s', disp mode: %d bpp, %s %'d x %'d", nvl(SDL_GetCurrentVideoDriver(), "(none)"), SDL_BITSPERPIXEL(sdl_mode.format), SDL_GetPixelFormatName(sdl_mode.format), sdl_mode.w, sdl_mode.h); //should match "tvservice -s"
//NOTE: will cre full screen if !XWindows (W + H ignored)
        const int X = isXWindows? sdl_mode.w / 10: SDL_WINDOWPOS_UNDEFINED, Y = isXWindows? sdl_mode.h / 10: SDL_WINDOWPOS_UNDEFINED;
        const int W = isXWindows? multiple(sdl_mode.w / 2, 16): 640, H = isXWindows? sdl_mode.h / 2: 480;
        const int flags = SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC;
        if (!SDL_OK(SDL_CreateWindowAndRenderer(W, H, flags, &sdl_window, &sdl_renderer))) return errmsg("SDL_CreateWindowAndRenderer");
        sdl_mode.w = W; sdl_mode.h = H; //requested size
        char title[100];
        sprintf(title, "SDL: GPU %'d x %'d", sdl_mode.w, sdl_mode.h);
        (void)SDL_SetWindowTitle(sdl_window, title);
//errmsg(PINK_MSG "SDL_CreateWindowAndRenderer");
        SDL_RendererInfo rinfo;
        if (!SDL_OK(SDL_GetRendererInfo(sdl_renderer, &rinfo))) return errmsg("SDL_GetRendererInfo %p", sdl_renderer);
        debug("renderer %p: name '%s', flag 0x%x, #fmts %d, maxw %'d, maxh %'d", sdl_renderer, rinfo.name, rinfo.flags, rinfo.num_texture_formats, rinfo.max_texture_width, rinfo.max_texture_height);
#ifndef LAZY_TEXTURE
//don't need texture until caller uses pixels:
        const int acc = SDL_TEXTUREACCESS_STATIC; //_STREAM?; //don't need to lock if using separate pixel array + VSYNC?
//errmsg(PINK_MSG "SDL_CreateTexture");
        sdl_texture = SDL_CreateTexture(sdl_renderer, SDL_PIXELFORMAT_ARGB8888, acc, sdl_mode.w, sdl_mode.h);
        if (!sdl_texture) return errmsg("SDL_CreateTexture %'d x %'d", sdl_mode.w, sdl_mode.h);
#endif //ndef LAZY_TEXTURE
        debug("sdl wnd opened %'d x %'d", sdl_mode.w, sdl_mode.h);
//draw first time in case caller doesn't update for a while:
//errmsg(PINK_MSG "SDL_SetRenderDrawColor, SDL_RenderClear, SDL_RenderPresent");
//        constexpr uint32_t color = 0xFF800080; //BLACK;
//debug("initialize window to 0x%x = r x%x, g x%x, b x%x, a x%x", color, R_G_B_A(color));
//        if (!SDL_OK(SDL_SetRenderDrawColor(sdl_renderer, R_G_B_A(color)))) return errmsg("SDL_SetRenderDrawColor");
//        if (!SDL_OK(SDL_RenderClear(sdl_renderer))) return errmsg("SDL_RenderClear");
////        SDL_SetRenderDrawColor(renderer, 255, 0, 0, 255);
//        (void)SDL_RenderPresent(sdl_renderer); //repaint screen; waits for VSYNC
        fb_clear(::BLACK);
debug("fb_open OK(%d): %'d x %'d, wnd %p, rend %p, txtr %p, px %p, dirty %d", FAKED_FD(), sdl_mode.w, sdl_mode.h, sdl_window, sdl_renderer, sdl_texture, m_pixels, m_dirty); //, &sdl_mode);
        return FAKED_FD(); //fake fd (success)
    }
//fill with color:
//NOTE: direct to texture (no pixel array)
#if 1 //broken: flickers back and forth when in wait loop
private:
    int fb_clear(uint32_t ext_color)
    {
debug("clear window 0x%x = r x%x, g x%x, b x%x, a x%x", ext_color, R_G_B_A(ext_color));
        if (!sdl_renderer) return errmsg("no renderer");
        if (!SDL_OK(SDL_SetRenderDrawColor(sdl_renderer, R_G_B_A(ext_color)))) return errmsg("SDL_SetRenderDrawColor");
        if (!SDL_OK(SDL_RenderClear(sdl_renderer))) return errmsg("SDL_RenderClear");
        (void)SDL_RenderPresent(sdl_renderer); //repaint screen; waits for VSYNC
        return 1; //success
    }
#endif
public:
    int fb_close(int fd)
    {
        if (!isXWindows) return close(fd);
#ifndef LAZY_TEXTURE
        if (sdl_texture) SDL_DestroyTexture(sdl_texture); sdl_texture = 0;
#endif //ndef LAZY_TEXTURE
        if (sdl_renderer) SDL_DestroyRenderer(sdl_renderer); sdl_renderer = 0;
        if (sdl_window) SDL_DestroyWindow(sdl_window); sdl_window = 0;
        SDL_Quit();
        if (fd != FAKED_FD()) return errmsg(-1, "unknown close file: %d (wanted FB %d)", fd, FAKED_FD());
        return 0; //success
    }
    int fb_ioctl(int fd, int cmd, void* data)
    {
        if (!isXWindows) return ioctl(fd, cmd, data);
//        static int count = 0;
//        if (count++ < 5) debug("fake ioctl(cmd 0x%x)", cmd);
        if (fd != FAKED_FD()) return errmsg(-1, "unknown ioctl file: %d (wanted FB %d)", fd, FAKED_FD());
        switch (cmd)
        {
//TODO?
//FBIOPAN_DISPLAY, FBIOPUT_VSCREENINFO
//OMAPFB_GET_LINE_STATUS
//OMAPFB_WAITFORVSYNC_FRAME
//https://github.com/raspberrypi/linux/blob/rpi-3.2.27/drivers/video/bcm2708_fb.c
//https://github.com/rst-/raspberry-compote/blob/master/fb/fbtestXI.c
            case FBIOGET_VSCREENINFO:
            {
                struct fb_var_screeninfo* vp = (struct fb_var_screeninfo*)data;
                memset(vp, 0, sizeof(*vp));
//        if (!m_info.var.pixclock)
//  m_info.var.left_margin + m_info.var.xres + m_info.var.right_margin + m_info.var.hsync_len;
//  m_info.var.upper_margin + m_info.var.yres + m_info.var.lower_margin + m_info.var.vsync_len;
// ->var.red.length, scrinfo->var.red.offset, scrinfo->var.red.msb_right,
// ->var.green.length, scrinfo->var.green.offset, scrinfo->var.green.msb_right,
// ->var.blue.length, scrinfo->var.blue.offset, scrinfo->var.blue.msb_right,
// ->var.transp.length, scrinfo->var.transp.offset, scrinfo->var.transp.msb_right,
// ->var.xoffset, scrinfo->var.yoffset);
//    auto bpp() const { return(screeninfo()->var.bits_per_pixel); } //bits
                vp->xres = sdl_mode.w;
                vp->yres = sdl_mode.h;
                if (!sdl_mode.w || !sdl_mode.h) return errmsg(-1, "sdl_mode !init");
                vp->bits_per_pixel = SDL_BITSPERPIXEL(sdl_mode.format);
                const char* fmt = SDL_GetPixelFormatName(sdl_mode.format);
//debug("cur disp mode: %d bpp, %s %'d x %'d", SDL_BITSPERPIXEL(sdl_mode.format), SDL_GetPixelFormatName(sdl_mode.format), sdl_mode.w, sdl_mode.h); //should match "tvservice -s"
                debug("ioctl: get var info, %'d x %'d, %d bpp %s", vp->xres, vp->yres, vp->bits_per_pixel, fmt);
                if (sdl_mode.format == SDL_PIXELFORMAT_RGB888)
                {
                    vp->red.length = vp->green.length = vp->blue.length = vp->transp.length = 8;
                    vp->red.offset = 16; vp->green.offset = 8; vp->blue.offset = 0; //??
//            , scrinfo->var.red.msb_right,
//              scrinfo->var.green.msb_right,
//             , scrinfo->var.blue.msb_right,
//             scrinfo->var.transp.offset, scrinfo->var.transp.msb_right,
//            scrinfo->var.xoffset, scrinfo->var.yoffset);
                }
                return 0; //success
            }
            case FBIOGET_FSCREENINFO:
            {
                struct fb_fix_screeninfo* fp = (struct fb_fix_screeninfo*)data;
                memset(fp, 0, sizeof(*fp));
//>fix.line_length / 4;
//>fix.smem_len)
                fp->line_length = sdl_mode.w * sizeof(m_pixels[0]);
                fp->smem_len = sdl_mode.h * fp->line_length; //= sdl_mode.w * sizeof(m_pixels[0]);
                return 0; //success
            }
            case FBIO_WAITFORVSYNC:
            {
                if (!sdl_renderer) return errmsg(-1, "no renderer");
//                static int count = 0; ++count;
//                if (count++ > 100) fatal("enough");
                const SDL_Rect& EntireRect = *(SDL_Rect*)0; //NULL; //src + dest rect
//printf(m_dirty? "D%d ": "c%d ", m_dirty);
                if (sdl_texture && m_dirty) //CAUTION: dirty needs to be on for 2 refreshes (due to double buffering?)
                {
                    if (!m_pixels) return errmsg(-1, "no pixel buf");
//if (count < 10) errmsg(PINK_MSG "SDL_UpdateTexture, SDL_RenderClear, SDL_RenderCopy");
                /*if (dirty)*/ if (!SDL_OK(SDL_UpdateTexture(sdl_texture, &EntireRect, m_pixels, sdl_mode.w * sizeof(m_pixels[0])))) return errmsg(-1, "SDL_UpdateTexture %'d x %d", sdl_mode.w, sizeof(m_pixels[0]));
//                static int lastTime = 0; //limit refresh rate (doesn't prevent tearing)
//                static int freq = 3; //example speed value
//#define TICKS_FOR_NEXT_FRAME (1000 / 60)
//        while (lastTime - SDL_GetTicks() < TICKS_FOR_NEXT_FRAME) SDL_Delay(1);
//                int now = //SDL_GetTicks();
//                    SDL_GetPerformanceCounter() / SDL_GetPerformanceFrequency();
//                float delta_time = (now - lastTime) * (float)freq;
//        new_pos = old_pos + speed * delta_time;
//        if (dirty)
                    if (!SDL_OK(SDL_RenderClear(sdl_renderer))) return errmsg(-1, "SDL_RenderClear");
                    if (!SDL_OK(SDL_RenderCopy(sdl_renderer, sdl_texture, &EntireRect, &EntireRect))) return errmsg(-1, "SDL_RenderCopy");
                    --m_dirty; //= false;
                }
//if (count < 10) errmsg(PINK_MSG "SDL_RenderPresent");
                (void)SDL_RenderPresent(sdl_renderer); //waits for VSYNC
//                lastTime = //SDL_GetTicks();
//                    SDL_GetPerformanceCounter() / SDL_GetPerformanceFrequency();
                return 0; //success
            }
        }
        return errmsg(-1, "unknown ioctl cmd: 0x%x (wanted 0x%x, 0x%x, or 0x%x)", cmd, FBIOGET_VSCREENINFO, FBIOGET_FSCREENINFO, FBIO_WAITFORVSYNC);
    }
    void* fb_mmap(void* addr, size_t len, int prot, int flags, int fd, int ofs)
    {
//        using rettype = uint8_t*; //void*; //needs size
        if (!isXWindows) return mmap(addr, len, prot, flags, fd, ofs);
        if (fd != FAKED_FD()) return errmsg(MAP_FAILED, "unknown mmap file: %d (wanted FB %d)", fd, FAKED_FD());
        size_t numpx = sdl_mode.h * sdl_mode.w; // * sizeof(m_pixels[0]);
        if (prot != (PROT_READ | PROT_WRITE)) return errmsg(MAP_FAILED, "unknown mmap prot: 0x%x (wanted 0x%x)", prot, PROT_READ | PROT_WRITE);
        if (flags != MAP_SHARED) return errmsg(MAP_FAILED, "unknown flags: 0x%x (wanted 0x%x)", flags, MAP_SHARED);
        if (sizeof(m_pixels[0]) != 4) return errmsg(MAP_FAILED, "pixel bad size: %d", sizeof(m_pixels[0]));
        if (len < numpx * sizeof(m_pixels[0])) return errmsg(MAP_FAILED, "mmap too short: %'d (wanted >= %'d)", len, numpx * sizeof(m_pixels[0]));
#ifdef LAZY_TEXTURE
        const int acc = SDL_TEXTUREACCESS_STATIC; //_STREAM?; //don't need to lock if using separate pixel array + VSYNC?
//errmsg(PINK_MSG "SDL_CreateTexture");
//SDL_RendererInfo rinfo;
//if (!SDL_OK(SDL_GetRendererInfo(sdl_renderer, &rinfo))) return errmsg(MAP_FAILED, "SDL_GetRendererInfo %p", sdl_renderer);
//debug("renderer %p: '%s', flag 0x%x, #fmts %d, maxw %'d, maxh %'d", sdl_renderer, rinfo.name, rinfo.flags, rinfo.num_texture_formats, rinfo.max_texture_width, rinfo.max_texture_height);
//Uint32[16] rinfo.texture_formats
        sdl_texture = SDL_CreateTexture(sdl_renderer, SDL_PIXELFORMAT_ARGB8888, acc, sdl_mode.w, sdl_mode.h);
        if (!sdl_texture) return errmsg(MAP_FAILED, "SDL_CreateTexture %'d x %'d", sdl_mode.w, sdl_mode.h);
#endif //def LAZY_TEXTURE
        m_pixels = new uint32_t[numpx];
        if (!m_pixels) return errmsg(MAP_FAILED, "alloc pixel buf");
        memset(m_pixels, 0, numpx * sizeof(m_pixels[0]));
        dirty(true); //repaint first time; TODO: read current screen + set false?
        return m_pixels;
    }
    int fb_munmap(void* addr, size_t len)
    {
        if (!isXWindows) return munmap(addr, len);
        if (addr != m_pixels) return errmsg(-1, "unknown mmap addr: %p (wanted FB %p)", addr, m_pixels);
        if (m_pixels) delete[] m_pixels; m_pixels = 0; dirty(false);
#ifdef LAZY_TEXTURE
        if (sdl_texture) SDL_DestroyTexture(sdl_texture); sdl_texture = 0;
#endif //def LAZY_TEXTURE
        return 0; //success
    }
    int fb_get_pxclk() const //kHz
    {
        int rr = sdl_mode.refresh_rate? sdl_mode.refresh_rate: 30;
        int retval = rr * sdl_mode.w * sdl_mode.h / 1e3;
        return retval? retval: 19.2e3; //kHz; assume VGA if SDL doesn't know
    }
#else //def HAS_SDL
    FBIO(): sdl_texture({0}), m_pixels(0), m_dirty(0)
    PERF_FWD(fb_open, ::open);
    PERF_FWD(fb_mmap, ::mmap);
    PERF_FWD(fb_ioctl, ::ioctl);
    PERF_FWD(fb_munmap, ::munmap);
    PERF_FWD(fb_close, ::close);
    int fb_get_pxclk() const { return 19.2e3; }
#endif //def HAS_SDL
};
//CAUTION: doesn't work on RPi unless initialized outside FBIO
/*static*/ const /*bool*/int FBIO::isXWindows = (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
const int FBIO::isRPi = fexists("/boot/config.txt");


//FB open/close wrapper:
//auto-close when done
class FB: public FBIO //: public fb_screeninfo
{
    using fd_t = int; //m_fd_nocvref = std::remove_cvref<decltype(m_fd)>::type;
    using time_t = decltype(time2msec()); //long int;
    const fd_t m_fd = 0;
    const time_t m_started = now();
public: //typedefs
//just give caller one struct to deal with:
    /*static*/ struct fb_screeninfo
    {
        struct fb_var_screeninfo var;
        struct fb_fix_screeninfo fix;
//        fb_screeninfo(): var({0}), fix({0}) {} //{ memset(this, 0, sizeof(*this)); } //debug("clr m_info"); } //ctor
    } m_info;
//    struct fb_screeninfo& m_info = *this;
public: //ctors/dtors
    explicit FB(): FB("/dev/fb0") {} //debug("FB ctor 1"); }
    explicit FB(const char* name): FB(fb_open(name, O_RDWR)) {} //debug("FB ctor 2"); }
    explicit FB(fd_t fd): m_info({0}) //: m_fd(0), m_started(now())
    {
//debug("FB ctor 3");
debug("fb fd %lu:%d, started@ %lu:%'d, elapsed %lu:%'d", sizeof(fd), fd, sizeof(m_started), m_started, sizeof(elapsed()), elapsed());
//debug("cur disp mode: %d bpp, %s %'d x %'d", SDL_BITSPERPIXEL(sdl_mode.format), SDL_GetPixelFormatName(sdl_mode.format), sdl_mode.w, sdl_mode.h); //should match "tvservice -s"
        if (!isOpen(fd)) RETURN(errmsg("fb open"));
//just get it once; assume won't change:
        if (fb_ioctl(fd, FBIOGET_VSCREENINFO, &m_info.var) < 0) RETURN(errmsg("get var screen info"));
        if (fb_ioctl(fd, FBIOGET_FSCREENINFO, &m_info.fix) < 0) RETURN(errmsg("get fix screen info"));
        if (!m_info.var.pixclock) m_info.var.pixclock = fb_get_pxclk();
//        if (!m_info.var.pixclock) RETURN(errmsg("get pixel clock"));
        *(fd_t*)&m_fd = fd; //set Open status only after getting screen info; bypass "const" within ctor
    }
    ~FB() { if (isOpen()) fb_close(m_fd); }
public: //operators
    explicit inline operator fd_t() const { return(m_fd); } //debug("int fd %d", m_fd); return(m_fd); }
//    explicit operator const decltype(m_info)* () { return screeninfo(); }
public: //getters/setters
    static inline time_t now() { return(time2msec()); }
    inline time_t elapsed() const
    {
//debug("elapsed: %'d - %'d = %'d", now(), m_started, now() - m_started);
        return(now() - m_started);
    }
    void elapsed(time_t new_elapsed)
    {
        time_t old_elapsed = elapsed();
        *(time_t*)&m_started += old_elapsed - new_elapsed; //bypass "const"
//reset frame count as well; preserve frame rate:
        sync_good = old_elapsed? new_elapsed * sync_good / old_elapsed: 0;
        sync_errs = old_elapsed? new_elapsed * sync_errs / old_elapsed: 0;
//also idle time:
        slept = old_elapsed? new_elapsed * slept / old_elapsed: 0;
    }
public: //methods
    inline bool isOpen() const { return(isOpen(m_fd)); }
    inline static bool isOpen(fd_t fd) { return(fd && (fd != -1)); }
    inline const auto /*decltype(m_info)**/ screeninfo() const { return(&m_info); }
//wait for video sync:
//allows very simple timing control; GPU controls caller's frame update rate
    time_t slept = 0; //total time spent waiting for vsync; use for perf tuning
    int sync_good = 0, sync_errs = 0; //won't ever wrap @60 fps
    inline int numfr() const { return(sync_good + sync_errs); }
    inline double fps() const { time_t elaps = elapsed(); return(elaps? 1e3 * numfr() / elaps: 0); } //actual
    int frtime() const //theoretical, msec
    {
        if (!m_info.var.pixclock) return errmsg("get pixel clock");
        int htotal = m_info.var.left_margin + m_info.var.xres + m_info.var.right_margin + m_info.var.hsync_len;
        int vtotal = m_info.var.upper_margin + m_info.var.yres + m_info.var.lower_margin + m_info.var.vsync_len;
        int retval = m_info.var.pixclock? htotal * vtotal / m_info.var.pixclock: 0;
//debug("htotal %'d, vtotal %'d, px clock %'d => frtime %'d msec", htotal, vtotal, m_info.var.pixclock, retval);
        return(retval? retval: 1e3 / 60); //return 1/60 sec if missing data
    }
    bool wait4sync() //bool delay_on_error = true)
    {
//        if (fbfd < 0) return -1;
//debug("wait4sync: op? %d, #good %'d, #errs %'d, frtime %'d, elapsed %'d", isOpen(), sync_good, sync_errs, frtime(), elapsed());
        if (isOpen())
        {
            int arg = 0;
            slept -= now();
            if (fb_ioctl(m_fd, FBIO_WAITFORVSYNC, &arg) >= 0) { slept += now(); return(++sync_good); } //true
            ++sync_errs; //only count errors if open
        }
        /*if (delay_on_error)*/ usleep(frtime() * 1e3); //wait 1/60 sec to maintain caller timing
        return(false); //error or !open
    }
    inline bool wait_sec(int sec) { return wait_msec(sec * 1e3); }
//TODO? wait_until(time_t elapsed)
    bool wait_msec(int msec)
    {
//debug("wait %d msec", msec);
        constexpr int day = 24 * 60 * 60 * 1e3; //msec
        const time_t wakeup = now() + msec; //TODO: use last sync timestamp?
        bool retval = true;
        for (;;)
        {
            retval = wait4sync() && retval; //wait at least 1 frame
//            int remaining = wakeup - now();
//            if (!ok) if (remaining > 0) usleep(remaining * 1e3);
//debug("now %'d, wkup %'d, ret? %d", now(), wakeup, now() >= wakeup);
            if (msec > day) return false; //msec = msec_per_day; //probably a caller bug; limit damage
            if (now() >= wakeup) return(retval);
        }
    }
//TODO?
//    save()
//    {
//        memcpy(&orig_vinfo, &vinfo, sizeof(struct fb_var_screeninfo));
//    }
//    restore()
//    {
//        if (ioctl(fbfd, FBIOPUT_VSCREENINFO, &orig_vinfo))
//            printf("Error re-setting variable information.\n");
//    }
};


//memory-mapped FB pixels:
//auto-close (unmap) when done
//template</*int BPP = 4,*/ bool BOUNDS_CHECK = true>
class FBPixels: public FB
{
    static const int CACHELEN = 64; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both
public: //typedefs
    using data_t = color_t; //argb_t; //uint32_t; //vs rgb888_t, rgb565_t
//    using size_t = unsigned int; //unsigned long int; //CAUTION: needs to be unsigned for simpler bounds checking
    struct leaf_t { static const size_t m_len = 1; }; //kludge: proxy for data_t
//wrapper for 2D addressing:
//NOTE: doesn't use array of arrays but looks like it
//parent manages all memory
//2D singleton: data is in parent
    template <typename CHILD_T>
    class ary
    {
    public: //data members
//CAUTION: must not contain instance data due to address placement
        static size_t m_len;
        static data_t* m_limit; //allow index past end as long as memory is there
        static const char* item_type;
        static inline size_t child_size() { return std::conditional<std::is_same<CHILD_T, data_t>::value, leaf_t, CHILD_T>::type::m_len; }
    public: //ctor/dtor
        ary() {}
        ~ary() {}
    public: //operators
//no bounds check:
//CAUTION: overlayed on top of m_px mmap array
        inline const CHILD_T& operator[](size_t inx) const
        {
            return *(const CHILD_T*)&((data_t*)this)[inx * child_size()];
        }
        inline CHILD_T& operator[](size_t inx) { return const_cast<CHILD_T&>(std::as_const(*this).operator[](inx));  } //non-const variant (DRY)
//with bounds check:
        inline const CHILD_T& at(size_t inx) const
        {
//debug("ary@ %p at limit check: %lu inx vs. (limit %p - this %p) / chsize %lu", this, inx, m_limit, this, child_size());
            return (inx < /*m_len*/ max_inx())? operator[](inx): oob(inx); //DRY
        }
        inline CHILD_T& at(size_t inx) { return const_cast<CHILD_T&>(std::as_const(*this).at(inx)); } //non-const variant (DRY)
    private: //helpers
        inline size_t max_inx() const { return (m_limit && child_size())? (m_limit - (data_t*)this) / child_size(): 0; } //allow indexing beyond this row as long as memory is there
        const CHILD_T& oob(size_t inx) const //generate out of bounds error
        {
            char errmsg[99];
            snprintf(errmsg, sizeof(errmsg), "%s index %'lu out of range 0..%'lu", item_type, inx, max_inx()); //m_len);
            throw new std::out_of_range(errmsg);
            return *(CHILD_T*)0; //NULL;
        }
    };
//    using ary2D = ary<ary<data_t>>;
//    using ary1D = ary<data_t>;
//    using ary0D = data_t;
private:
//    int m_bpp;
    data_t* const m_px;
//    data_t* const* const m_rowpx; //for 2D access
    data_t m_dummy; //1 dummy pixel for out-of-bounds l-value/ref
    const size_t m_rowlen32, m_height; //CAUTION: horizontal raster lines might be padded, so store effective width
    const size_t m_numpx; //slightly WET to reduce run-time bounds checking :(
public: //ctors/dtors
    template <typename ... ARGS> //perfect forward to parent ctor
//CAUTION: init order: pixels has dependencies so set it last
    explicit FBPixels(ARGS&& ... args): FB(std::forward<ARGS>(args) ...), m_px(m_px_init()), pixels(*(ary<ary<data_t>>*)m_px), m_dummy(0), m_rowlen32(screeninfo()->fix.line_length / 4), m_height(screeninfo()->var.yres), m_numpx(m_rowlen32 * m_height)
    {
        debug("FBPixels::ctor, color %lu bytes", sizeof(m_px[0]));
//    explicit empty_base(ARGS&& ... args) {} //: base(std::forward<ARGS>(args) ...)
//        auto scrinfop = screeninfo();
        if (!isOpen()) RETURN(errmsg("open framebuffer"));
        switch (bpp()) //scrinfop->var.bits_per_pixel)
    	{
	    	case 16: RETURN(errmsg("TODO: RGB565"));
            case 24: break; //RETURN(errmsg("TODO: RGB24"));
            case 32: break; //RETURN(errmsg("TODO: RGB32"));
            default: RETURN(errmsg("unhandled pixel format: %d bpp (wanted 24 or 32)", bpp()));
        }
//        m_size = width() * height(); //screeninfo()->var.xres * screeninfo()->var.yres; // * scrinfo->var.bits_per_pixel / 8;
//        m_width = screeninfo()->var.xres;
        auto scrinfo = screeninfo();
        debug("(color masks 8-bit, byte aligned, little endian) red: %'d:+%'d^%'d, green: %'d:+%'d^%'d, blue: %'d:+%'d^%'d, xpar: %'d:+%'d^%'d, xofs %'d, yofs %'d",
            scrinfo->var.red.length, scrinfo->var.red.offset, scrinfo->var.red.msb_right,
            scrinfo->var.green.length, scrinfo->var.green.offset, scrinfo->var.green.msb_right,
            scrinfo->var.blue.length, scrinfo->var.blue.offset, scrinfo->var.blue.msb_right,
            scrinfo->var.transp.length, scrinfo->var.transp.offset, scrinfo->var.transp.msb_right,
            scrinfo->var.xoffset, scrinfo->var.yoffset);
//        size_t new_height = screeninfo()->var.yres;
//        size_t new_rowlen32 = screeninfo()->fix.line_length / 4; //NOTE: might be larger than screen hres due to padding
//        size_t new_numpx = new_height * new_rowlen32; //only set size if mmap successful; NOTE: might be larger than screen hres due to padding
//        if (new_rowlen32 != screeninfo()->var.xres) debug(YELLOW_MSG "CAUTION: raster rowlen32 %'lu != width %'d", new_rowlen32, screeninfo()->var.xres);
//        if (new_height * new_rowlen32 * 4 != screeninfo()->fix.smem_len) debug(YELLOW_MSG "CAUTION: raster size %'lu != calc %'d", new_height * new_rowlen32 * 4, screeninfo()->fix.smem_len);
//        *(data_t**)&m_px = (data_t*)fb_mmap((void*)0, new_height * new_rowlen32 * 4, PROT_READ | PROT_WRITE, MAP_SHARED, (int)*this, 0); //shared with GPU
        if (m_px == (data_t*)MAP_FAILED) RETURN(errmsg("px mmap"));
//        *(data_t***)&m_rowpx = new data_t**[new_height];
//        typedef /*alignas(CACHELEN)*/ NODEVAL UNIV[UNIV_MAXLEN]; //align univ to cache for better mem perf across cpus
//        if ((long)m_px % CACHELEN) errmsg("mmap !multiple of cache size %'d: %p", CACHELEN, m_px);
//        SDL_SetError("(potential multi-CPU contention)");
//        if ((new_rowlen32 * 4) % CACHELEN) errmsg("row len !multiple of cache size %'d: 0x%x", CACHELEN, new_rowlen32 * 4);
//only set size if mmap successful (enabled bounds-checking):
//slightly WET to avoid extra arith inside tight pixel loops:
//        *(size_t*)&m_numpx = m_height * m_rowlen32;
//2D indexing:
//NOTE: must be set before using pixels.at()
        ary<ary<data_t>>::m_limit = ary<data_t>::m_limit = m_px + m_numpx;
        ary<ary<data_t>>::m_len = m_height;
        ary<data_t>::m_len = m_rowlen32;
debug("mmap@ %p, bpp %d, size %'lu (info says %'d), rowlen32(w) %'lu, h %'lu, #px %'lu, pxrow[0]@ %p, pxrow[1]@ %p", m_px, bpp(),  m_height * m_rowlen32 * 4, scrinfo->fix.smem_len, m_rowlen32, m_height, m_numpx, &pixels[0], &pixels.at(1));
//no; leave contents intact        memset(m_px, 0, m_numpx * BPP()); //start all transparent black
    }
    ~FBPixels()
    {
        debug("FBPixels::dtor");
//        if (m_rowpx) delete m_rowpx; //m_rowpx = 0;
        if (m_numpx && (fb_munmap((data_t*)m_px, m_numpx * 4) == -1)) errmsg("px munmap");
    }
    FBPixels(const FBPixels& that): m_px(0), pixels(*(ary<ary<data_t>>*)m_px),m_dummy(0), m_rowlen32(0), m_height(0), m_numpx(0) { *this = that; } //avoid [-Weffc++] warning
private: //ctor helpers (member init)
    data_t* m_px_init()
    {
        auto scrinfo = screeninfo();
        size_t height = scrinfo->var.yres;
        size_t rowlen32 = scrinfo->fix.line_length / 4; //NOTE: might be larger than screen hres due to padding
        if (rowlen32 != scrinfo->var.xres) debug(YELLOW_MSG "CAUTION: raster rowlen32 %'lu != scr width %'d", rowlen32, scrinfo->var.xres);
        if (height * rowlen32 * 4 != scrinfo->fix.smem_len) debug(YELLOW_MSG "CAUTION: raster size %'lu != scr mem len %'d", height * rowlen32 * 4, scrinfo->fix.smem_len);
        SDL_SetError("(potential multi-CPU contention)");
        if ((rowlen32 * 4) % CACHELEN) debug(YELLOW_MSG "row len !multiple of cache size %'d: 0x%lx", CACHELEN, rowlen32 * 4);
        return isOpen()? (data_t*)fb_mmap((void*)0, height * rowlen32 * 4, PROT_READ | PROT_WRITE, MAP_SHARED, (int)*this, 0): (data_t*)MAP_FAILED; //shared with GPU
    }
public: //operators
    FBPixels& operator=(const FBPixels& that) { return *this = that; } //[-Weffc++]
public: //getters/setters
    inline size_t width() const { return(m_rowlen32); } //screeninfo()->var.xres); }
    inline size_t height() const { return(m_height); } //screeninfo()->var.yres); }
    inline auto bpp() const { return(screeninfo()->var.bits_per_pixel); } //bits
    inline auto BPP() const { return(screeninfo()->var.bits_per_pixel / 8); } //bytes
//public: //methods
//NOTE: compiler should be smart enough to optimize out unneeded checks:
#if 1
    ary<ary<data_t>>& pixels; //2D pixel array access; at() bounds check, "[]" no bounds check
//    data_t& operator() (size_t x, size_t y) { return m_buf[x + y * h]; }
//    inline bool inbounds(size_t xyinx) const { return(/*BOUNDS_CHECK?*/ (xyinx < m_numpx)); }
    inline bool inbounds(size_t x, size_t y) const { return(/*!BOUNDS_CHECK ||*/ ((x < m_rowlen32) && (y < m_height))); }
    size_t xyinx(size_t x, size_t y) const { return(inbounds(x, y)? y * m_rowlen32 + x: m_numpx); } //? m_numpx: -1); } //-1); } //CAUTION: invalid index should also fail bound check, but should still allow use as upper limit
//    data_t& pixel(size_t x, size_t y) { return(inbounds(x, y)? m_px[xyinx(x, y)]: m_dummy); } //rd/wr
    data_t& pixel(size_t x, size_t y, data_t color) { dirty(true); return pixel(x, y) = color; } //rd/wr
    data_t& pixel(size_t x, size_t y) { return pixels.at(y).at(x); } //return m_buf[x + y * ary<ary<data_t>>::m_len]; }
//    const data_t& pixel(size_t x, size_t y) const { return(inbounds(x, y)? m_px[xyinx(x, y)]: 0); } //rd-only
    data_t& pixel(size_t ofs) { return pixels[0].at(ofs); } //return(inbounds(ofs)? m_px[ofs]: m_dummy); } //rd/wr
//    const data_t& pixel(size_t ofs) const { return(inbounds(ofs)? m_px[ofs]: 0); } //rd-only
#else
//(x, y) access to pixels (intended for low-volume usage):
    bool inbounds(size_t x, size_t y) const { return(!BOUNDS_CHECK || ((x < m_rowlen32) && (y < m_height))); }
    size_t xyinx(size_t x, size_t y) const { return(inbounds(x, y)? y * m_rowlen32 + x: m_numpx); } //? m_numpx: -1); } //-1); } //CAUTION: invalid index should also fail bound check, but should still allow use as upper limit
    data_t& pixel(size_t x, size_t y) { return(pixel(xyinx(x, y))); } //rd/wr
    const data_t& pixel(size_t x, size_t y) const { return(pixel(xyinx(x, y))); } //rd-only
//linear/array access to pixels:
//NOTE: caller can ignore padding because width is compensated
//    bool inbounds(size_t ofs) const { return(BOUNDS_CHECK? (ofs < m_numpx): m_numpx); }
    data_t& pixel(size_t ofs) { return(inbounds(ofs)? m_px[ofs]: m_dummy); } //rd/wr
    const data_t& pixel(size_t ofs) const { return(inbounds(ofs)? m_px[ofs]: 0); } //rd-only
#endif
//    data_t** pixels(size_t numpx) /*const*/ { return(inbounds(numpx - 1)? m_rowpx: 0); }
//    data_t** pixels() /*const*/ { return(m_rowpx); }
//    bool clear() { return fb_clear(::BLACK); }
//    bool clear(uint32_t color) { return fb_clear(color); }
    inline void fill() { fill(::BLACK); }
//    void fill(constexpr uint32_t argb) { fill(_t color(argb); debug("fill %'d px with 0x%x", m_numpx, color.uint32); for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color.uint32; }
//    void fill(constexpr uint32_t argb) { argb_t color(argb); debug("fill %'d px with 0x%x", m_numpx, color.uint32); for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color.uint32; }
    void fill(uint32_t color) //argb)
    {
//        color_t color(argb);
        debug("fill %'lu px with ext 0x%x", m_numpx, color/*.uint32*/);
        for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color; //.uint32;
        dirty(true);
    }
    void row(size_t y, uint32_t color) //argb)
    {
//        color_t color(argb);
//        debug("fill %'d px @%p+[%'d..%'d) with 0x%x", m_numpx, m_px, xyinx(0, y), xyinx(0, y + 1), color);
        for (size_t i = xyinx(0, y), limit = xyinx(0, y + 1); i < limit; ++i) m_px[i] = color; //.uint32;
//        int sv_dirty = dirty();
        dirty(true);
//        debug("dirty %d -> %d", sv_dirty, dirty());
    }
    void col(size_t x, uint32_t color) //argb)
    {
//        color_t color(argb);
//        debug("fill %'d px with 0x%x", m_numpx, color.uint32);
        for (size_t i = xyinx(x, 0); i < m_numpx; i += m_rowlen32) m_px[i] = color; //.uint32;
        dirty(true);
    }
//#ifndef HAS_SDL //kludge: missing method
//    int fb_clear(uint32_t ext_color) { return fill(ext_color); }
//#endif //ndef HAS_SDL
};
//CAUTION: static class members need init value in order to be found
template<> STATIC size_t FBPixels::ary<FBPixels::ary<FBPixels::data_t>>::m_len = 0;
template<> STATIC FBPixels::data_t* FBPixels::ary<FBPixels::ary<FBPixels::data_t>>::m_limit = 0;
template<> STATIC const char* FBPixels::ary<FBPixels::ary<FBPixels::data_t>>::item_type = "pixel row";
template<> STATIC size_t FBPixels::ary<FBPixels::data_t>::m_len = 0;
template<> STATIC FBPixels::data_t* FBPixels::ary<FBPixels::data_t>::m_limit = 0;
template<> STATIC const char* FBPixels::ary<FBPixels::data_t>::item_type = "pixel col";


///////////////////////////////////////////////////////////////////////////////
////
/// WS281X wrapper
//

class WS281x: public FBPixels
{
//    FBPixels fbpx;
public:
    WS281x() {}
    ~WS281x() {}
};


//24-bit pivot:
//rotates 24 independent channels of pixels into 24-bit parallel output values
//RPi GPU is not fast enough for 24 memory accesses per pixel, so make CPU do it :(
//for WS281X, adds bit start + stop into data stream
//for YALP, also adds frame# and checksum into data stream
#pragma message(CYAN_MSG "TODO: pivot24" ENDCOLOR_NOLINE)
#if 0 //TODO
void draw()
{
	uint32_t colors[] = {RGSWAP(RED), RGSWAP(GREEN), BLUE, YELLOW, RGSWAP(CYAN), RGSWAP(MAGENTA), WHITE};
//for (int i = 0; i < nel(colors); ++i) printf("color[%'d/%'d]: 0x%x\n", i, nel(colors), colors[i]);
	long int scrsize = vinfo.xres * vinfo.yres * vinfo.bits_per_pixel / 8;
	memset(fbp, 0, scrsize);
//set first 10 nodes (24-1 bits):
//	uint32_t color = 0xff00ff; //R <-> G; //0x00ffff; //cyan (RGB)
for (int loop = 0; loop <= 10; ++loop)
{
for (int y = 0; y < 37; ++y)
	for (int b = 0; b < 24; ++b) //NOTE: last bit is partially hidden by hsync
	{
		uint32_t color = colors[(y + loop) % nel(colors)];
		if (loop == 10) color = 0;
//if (!b) printf("node[%'d]: 0x%x\n", y, color);
		uint32_t bv = color & (0x800000 >> b);
		for (int i = 0; i < BITW(b); ++i)
		{
			int onoff = (i < _H(bv))? 0xff: 0;
			put_pixel(BITW(0) * b + i, y, onoff, onoff, onoff);
		}
	}
sleep(1);
}
}
#endif


///////////////////////////////////////////////////////////////////////////////
////
/// Javascript interface:
//

//which Node API to use?
//V8 is older, requires more familiarity with V8
//NAPI is C-style api and works ok; #include <node_api.h>
//Node Addon API is C++ style but had issues in 2018; #include <napi.h>
//N-API is part of Node.js + maintained by Node.js team, guarantees ABI compatibility - shouldn't need to rebuild when Node.js updated
//therefore, use N-API

#ifdef NODE_GYP_MODULE_NAME
#include <cstdio> //fileno()
#include <unistd.h> //isatty()
#include "napi.h" //Node Addon API
//https://github.com/nodejs/node-addon-examples
//https://github.com/nodejs/node-addon-api#examples

//NAPI objects always need a content (env), so carry them together:
//CAUTION; do not store napi_values across high-level napi calls / on heap
//struct napi_thing
//{
//    Napi::Env env; //CAUTION: doesn't remain valid across napi calls/events
//    Napi::Object obj;
//};
//#define napi_thing(env, obj)  Napi::Env env, Napi::Object obj


//root of export chain:
Napi::Object export_tree(Napi::Env env, Napi::Object exports) { return exports; }
//napi_thing& export_tree(napi_thing& exports) { return exports; }
#define module_exports  export_tree


class napi_FBPixels: public Napi::ObjectWrap<napi_FBPixels>
{
    using self = napi_FBPixels;
public: //ctors/dtors
    napi_FBPixels(const Napi::CallbackInfo& args): Napi::ObjectWrap<napi_FBPixels>(args) {}
//    {
//        Napi::Env env = args.Env();
//        int length = args.Length();
////        if (length <= 0 || !args[0].IsNumber())
////        {
////            Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
////            return;
////        }
//        bool no_arg = (length <= 0 || !args[0].IsNumber());
//        Napi::Number value = no_arg? Napi::Number::New(args.Env(), 10): args[0].As<Napi::Number>();
//        this->value_ = value.DoubleValue();
//    }
private: //members
//    double value_;
    FBPixels fbpx;
//    static inline FBPixels<>* my(void* ptr) { return static_cast<FBPixels<>*>(ptr); }
public: //getters/setters
//    static inline napi_value univlen_getter(napi_env env, void* ptr)
//    {
//        return napi_thingy(env, my(ptr)->wh.h, napi_thingy::Uint32{});
//    }
    Napi::Value isOpen_getter(const Napi::CallbackInfo &info)
    {
//        Napi::Env env = info.Env();
        return Napi::Number::New(info.Env(), this->fbpx.isOpen());
    }
    Napi::Value width_getter(const Napi::CallbackInfo &info)
    {
//        Napi::Env env = info.Env();
        return Napi::Number::New(info.Env(), this->fbpx.width());
    }
    Napi::Value height_getter(const Napi::CallbackInfo &info)
    {
//        Napi::Env env = info.Env();
        return Napi::Number::New(info.Env(), this->fbpx.height());
    }
    Napi::Value bpp_getter(const Napi::CallbackInfo &info)
    {
//        Napi::Env env = info.Env();
        return Napi::Number::New(info.Env(), this->fbpx.bpp());
    }
    Napi::Value numfr_getter(const Napi::CallbackInfo &info)
    {
//        Napi::Env env = info.Env();
        return Napi::Number::New(info.Env(), this->fbpx.numfr());
    }
    Napi::Value fps_getter(const Napi::CallbackInfo &info)
    {
//        Napi::Env env = info.Env();
        return Napi::Number::New(info.Env(), this->fbpx.fps());
    }
    Napi::Value slept_getter(const Napi::CallbackInfo &info)
    {
//        Napi::Env env = info.Env();
        return Napi::Number::New(info.Env(), this->fbpx.slept);
    }
//buffers + externals: https://adaltas.com/en/2018/12/12/native-modules-node-js-n-api/
//externals: https://github.com/nodejs/node-addon-api/blob/master/doc/external.md
//see Napi::Buffer, Napi::ArrayBuffer, Napi::TypedArray
//to rcv buf from js:
//Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
//Buffer<t> Napi::Buffer<t>::New(env, data*, len, finalizer, hint*);
//?? NewBuffer(void* data, size, delete_cb, thing)
    Napi::Value pixels_getter(const Napi::CallbackInfo &info)
    {
//CAUTION: caller is responsible for setting dirty flag
//        Napi::Env env = info.Env();
        int w = this->fbpx.width(), h = this->fbpx.height();
        uint32_t* pxbuf = &this->fbpx.pixels[0][0]; //(w * h);
        if (!pxbuf || !w || !h) return err_napi(info.Env(), "pixel buffer broken");
        auto retval = Napi::Array::New(info.Env(), h);
        auto arybuf = Napi::ArrayBuffer::New(info.Env(), pxbuf, w * h * 4); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        for (uint32_t y = 0; y < h; ++y)
        {
            int len = y? w: (h - y) * w; //allow caller to use linear addresses on first row
            auto rowary = Napi::TypedArrayOf<uint32_t>::New(info.Env(), len, arybuf, y * w * 4, napi_uint32_array); ////https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
//?            retval.set(y, rowary);
            retval[y] = rowary; //CAUTION: RPi needs y to be uint32_t
        }
//Buffer<t> Napi::Buffer<t>::New(env, data*, len);
        return retval; //array of typed arrays
    }
//TODO?    int sync_good = 0, sync_errs = 0; //won't ever wrap @60 fps
    Napi::Value dirty_getter(const Napi::CallbackInfo &info)
    {
        return Napi::Number::New(info.Env(), this->fbpx.dirty());
    }
    void dirty_setter(const Napi::CallbackInfo &info, const Napi::Value &value)
    {
//different functions
        if (value.IsBoolean())
        {
            const bool flag = value.As<Napi::Boolean>().Value();
            this->fbpx.dirty(flag);
        }
        else
        {
            const int flag = /*value.IsBoolean()?*/ value.As<Napi::Number>().Int32Value();
            this->fbpx.dirty(flag);
        }
    }
    Napi::Value elapsed_getter(const Napi::CallbackInfo &info)
    {
//        Napi::Env env = info.Env();
        return Napi::Number::New(info.Env(), this->fbpx.elapsed());
    }
//    static Napi::Value frtime_getter(napi_env env, void* ptr) /*const*/ { return napi_thingy(env, my(ptr)->frame_time, napi_thingy::Float{}); }
//WRONG SIG:  Napi::Value Example::ex_SetValue(const Napi::CallbackInfo &info)
//    {
//        Napi::Env env = info.Env();
//        // ...
//        Napi::Number value = info[0].As<Napi::Number>();
//        this->_value = value.DoubleValue();
//        return this->GetValue(info);
//    }
//setter signature: https://github.com/nodejs/node-addon-api/issues/503
    void elapsed_setter(const Napi::CallbackInfo &info, const Napi::Value &value)
    {
//        if ((info.Length() < 1)) // || !info[0].IsNumber())
//            Napi::TypeError::New(info.Env(), "Number expected").ThrowAsJavaScriptException();
//        Napi::Env env = info.Env();
//        const auto arg = value.As<Napi::Number>();
//        this->_value = value.DoubleValue();
//wrong        Napi::Number value = info[0].As<Napi::Number>();
//        const auto native_value = arg.Int32Value();
        const auto msec = value.As<Napi::Number>().Int32Value();
//        native_instance_->height = native_value;
        this->fbpx.elapsed(msec);
    }
//helpers
    Napi::Value err_napi(const Napi::Env& env, const char* fmt, ...)
    {
        char msgbuf[300];
        va_list args;
        va_start (args, fmt);
        vsnprintf(msgbuf, sizeof(msgbuf), fmt, args);
        va_end(args);    
        Napi::TypeError::New(env, msgbuf).ThrowAsJavaScriptException();
        return env.Undefined(); //Napi::Number::New(info.Env(), 0); //TODO: undefined
    }
//private: //methods
#if 0
    Napi::Value clear_func(const Napi::CallbackInfo& info)
    {
//        Napi::Value undef;
//        napi_get_undefined(info.Env(), &undef);
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "color (Number) expected");
//        /*Napi::Number*/ const auto color = info[0].As<Napi::Number>();
//        /*int*/ const auto color_int = color.Uint32Value();
        const auto color = info[0].As<Napi::Number>().Uint32Value();
        auto retval = this->fbpx.clear(color); //goes direct to FB
        return Napi::Number::New(info.Env(), retval);
    }
#endif
    Napi::Value fill_func(const Napi::CallbackInfo& info)
    {
//        Napi::Value undef;
//        napi_get_undefined(info.Env(), &undef);
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "color (Number) expected");
//        /*Napi::Number*/ const auto color = info[0].As<Napi::Number>();
//        /*int*/ const auto color_int = color.Uint32Value();
        const auto color = info[0].As<Napi::Number>().Uint32Value();
        this->fbpx.fill(color); //updates pixel array in memory
        return info.Env().Undefined(); //Napi::Number::New(info.Env(), 0); //TODO: undefined
    }
    Napi::Value row_func(const Napi::CallbackInfo& info)
    {
//        Napi::Value undef;
//        napi_get_undefined(info.Env(), &undef);
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber()) return err_napi(info.Env(), "row index 0..%'d, color (both Numbers) expected", this->fbpx.height() - 1);
        const auto y = info[0].As<Napi::Number>().Int32Value();
        const auto color = info[1].As<Napi::Number>().Uint32Value();
        this->fbpx.row(y, color);
        return info.Env().Undefined(); //Napi::Number::New(info.Env(), 0); //TODO: undefined
    }
    Napi::Value col_func(const Napi::CallbackInfo& info)
    {
//        Napi::Value undef;
//        napi_get_undefined(info.Env(), &undef);
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber()) return err_napi(info.Env(), "column index 0..%'d, color (both Numbers) expected", this->fbpx.width() - 1);
        const auto x = info[0].As<Napi::Number>().Int32Value();
        const auto color = info[1].As<Napi::Number>().Uint32Value();
        this->fbpx.col(x, color);
        return info.Env().Undefined(); //Napi::Number::New(info.Env(), 0); //TODO: undefined
    }
//CAUTION: intended for low bandwidth usage (due to high per-access overhead)
    Napi::Value pixel_func(const Napi::CallbackInfo& info)
    {
//        Napi::Value undef;
//        napi_get_undefined(info.Env(), &undef);
//        if ((info.Length() < 2)) // || !info[0].IsNumber()) return err_napi("x 0..%'d, y 0..%'d, optional color (all Numbers) expected", this->fbpx.width() - 1, this->fbpx.height() - 1);
        const auto x = info[0].As<Napi::Number>().Int32Value();
        const auto y = info[1].As<Napi::Number>().Int32Value();
        size_t ixy = this->fbpx.xyinx(x, y);
#if 1 //assume low bandwidth; help caller to debug indexing errors
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber() || (ixy == (size_t)-1) || ((info.Length() > 2) && !info[2].IsNumber())) return err_napi(info.Env(), "x 0..%'d, y 0..%'d, optional color (all Numbers) expected", this->fbpx.width() - 1, this->fbpx.height() - 1);
#endif
        if (info.Length() > 2)
        {
            const auto color = info[2].As<Napi::Number>().Uint32Value();
            this->fbpx.pixel(ixy) = color;
            this->fbpx.dirty(true);
        }
        return Napi::Number::New(info.Env(), this->fbpx.pixel(ixy));
    }
//async callback examples: https://nodejs.org/api/n-api.html#n_api_simple_asynchronous_operations
#if 0
    class wait4sync_AsyncWker: public Napi::AsyncWorker
    {
        FBPixels<>& m_fbpx;
        bool m_retval;
    public:
        wait4sync_AsyncWker(FBPixels<>& data, Napi::Function& cb): m_fbpx(data), AsyncWorker(cb) {}
        void Execute() //CAUTION: executes on different thread
        {
            m_retval = m_fbpx.wait4sync();
//simpler just to return errors to cb than raise error; cb also then fits promises
//            std::string errmsg = "wait4sync failed";
//            if (!retval) Napi::AsyncWorker::SetError(errmsg);
        }
        void OnOK() //called on main Node.js event loop, not worker thread
        {
//            cb.Call(env.Global(), {Napi::String::New(env, "hello world")});
            Napi::Env env = Env();
//            cb.Call(env.Global(),
            Callback().MakeCallback(
                Receiver().Value(),
                {
                    env.Null(),
                    Napi::Number::New(env, m_retval),
                });
//                info.Env().Undefined(), //no error code
//                Napi::Number::New(info.Env(), m_retval),
//                Napi::String::New(env, "hello world"),
        }
//        void OnError(const Error& err) //called on main Node.js event loop, not worker thread
//        {
//            todo;
//        }
    };
    /*void?*/ Napi::Value wait4sync_func(const Napi::CallbackInfo& info)
    {
        if ((info.Length() < 1)) // || !info[0].IsNumber())
        {
            Napi::TypeError::New(info.Env(), "Callback function expected").ThrowAsJavaScriptException();
            return Napi::Number::New(info.Env(), false);
        }
        Napi::Function cb = info[0].As<Napi::Function>();
//        wait4sync_AsyncWker* wker = new wait4sync_AsyncWker(this->fbpx, cb);
//        wker->Queue();
        (new wait4sync_AsyncWker(this->fbpx, cb))->Queue();
//        int retval = this->fbpx.wait4sync(); //TODO: async callback
        return info.Env().Undefined(); //Napi::Number::New(info.Env(), retval);
    }
#endif
//https://github.com/nodejs/node-addon-examples/issues/85
//class PiWorker : public Napi::AsyncWorker
//{
//public:
//    PiWorker(Napi::Env &env, int points, Napi::Promise::Deferred &deferred)
//            : Napi::AsyncWorker(env), points(points), estimate(0), deferred(deferred) {}
//    ~PiWorker() {}
    // Executed inside the worker-thread.
    // It is not safe to access JS engine data structure
    // here, so everything we need for input and output
    // should go on `this`.
//    void Execute()
//    {
//        int count = 0;
//        for (int i = 0; i < points; ++i) {
//            float x = float(rand()) / RAND_MAX;
//            float y = float(rand()) / RAND_MAX;
//            if (sqrt(x * x + y * y) < 1)
//                count++;
//        }
//        estimate = 4.0 * count / points;
        // you could handle errors as well
        // throw std::runtime_error("test error");
        // or like
        // Napi::AsyncWorker::SetError
        // Napi::AsyncWorker::SetError("test error");
//    }
    // Executed when the async work is complete
    // this function will be run inside the main event loop
    // so it is safe to use JS engine data again
//    void OnOK() { deferred.Resolve(Napi::Number::New(Env(), estimate)); }
//    void OnError(Napi::Error const &error) { deferred.Reject(error.Value()); }
//private:
//    int points;
//    double estimate;
//    Napi::Promise::Deferred& deferred;
//};
//Napi::Value CalculatePiAsync(const Napi::CallbackInfo &info)
//{
//    Napi::Env env = info.Env();
//    int points = info[0].As<Napi::Number>().Uint32Value();
//    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
//    PiWorker *piWorker = new PiWorker(env, points, deferred);
//    piWorker->Queue();
//    return deferred.Promise();
//}
    class await4sync_AsyncWker: public Napi::AsyncWorker
    {
    protected:
        FBPixels& m_fbpx;
        bool m_retval;
        Napi::Promise::Deferred/*&*/ m_def; //causes dangling-pointer if referred object is local/temporary in caller of constructor??
    public:
        await4sync_AsyncWker(const Napi::Env& env, Napi::Promise::Deferred& def, FBPixels& data): AsyncWorker(env), m_def(def), m_fbpx(data) {}
        await4sync_AsyncWker(const Napi::Env& env, FBPixels& data): AsyncWorker(env), m_def(Napi::Promise::Deferred::New(env)), m_fbpx(data) {}
        ~await4sync_AsyncWker() {}
        Napi::Promise GetPromise() { return m_def.Promise(); }
        void Execute() //CAUTION: executes on different thread
        {
            m_retval = m_fbpx.wait4sync();
//simpler just to return errors to cb than raise error; cb also then fits promises
//            std::string errmsg = "wait4sync failed";
//            if (!retval) Napi::AsyncWorker::SetError(errmsg);
        }
        void OnOK() { m_def.Resolve(Napi::Number::New(/*env*/ Env(), m_retval)); } //called on main Node.js event loop, not worker thread
//        void OnError(Napi::Error const &error) { m_def.Reject(error.Value()); }
    };
//https://github.com/nodejs/node-addon-examples/issues/85
//https://github.com/nodejs/node-addon-api/blob/master/doc/promises.md
    Napi::Value await4sync_func(const Napi::CallbackInfo& info)
    {
//        Napi::Env env = info.Env();
//        Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
        await4sync_AsyncWker* wker = new await4sync_AsyncWker(info.Env(), this->fbpx);
//        auto promise = wker->GetPromise();
        wker->Queue();
        return wker->GetPromise();
    }
//example from https://codemerx.com/blog/asynchronous-c-addon-for-node-js-with-n-api-and-node-addon-api/
//void ProcessData(const CallbackInfo& info)
//{
//    Buffer<uint8_t> data = info[0].As<Buffer<uint8_t>>();
//    Function cb = info[1].As<Function>();
//    DataProcessingAsyncWorker *worker = new DataProcessingAsyncWorker(data, cb);
//    worker->Queue();
//}
//class DataProcessingAsyncWorker : public AsyncWorker
//{
//    public:
//    DataProcessingAsyncWorker(Buffer<uint8_t> &data, Function &callback) :
//         AsyncWorker(callback), 
//         dataRef(ObjectReference::New(data, 1)),
//            dataPtr(data.Data()),
//            dataLength(data.Length())
//    {
//    }
//    void Execute() //CAUTION: executes on different thread
//    {
//        for (size_t i = 0; i < dataLength; i++)
//        {
//            uint8_t value = *(dataPtr + i);
//            *(dataPtr + i) = value * 2;
//        }
//    }
//    void OnOK() override //called on main Node.js event loop, not worker thread
//  {
//        Callback().Call({});
//        dataRef.Unref(); //dec ref count; allow GC
//-------------------------------
//    Napi::Env env = Env();
//    Callback().MakeCallback(
//      Receiver().Value(),
//      {
//        env.Null(),
//        Napi::Number::New(env, sum)
//      }
//    );
//  }
//      void OnError() //called on main Node.js event loop, not worker thread
//void OnError(const Napi::Error& e) override
//  {
//    Napi::Env env = Env();
//    Callback().MakeCallback(
//      Receiver().Value(),
//      {
//        e.Value(),
//        env.Undefined()
//      }
//    );
//  }
//    private:
//        ObjectReference dataRef; //inc ref count; prevent GC
//        uint8_t *dataPtr;
//        size_t dataLength;
//};
    class awaitmsec_AsyncWker: public await4sync_AsyncWker //Napi::AsyncWorker
    {
        int m_delay;
    public:
        awaitmsec_AsyncWker(const Napi::Env& env, Napi::Promise::Deferred& def, FBPixels& data, int delay): await4sync_AsyncWker(env, def, data), m_delay(delay) {}
        awaitmsec_AsyncWker(const Napi::Env& env, FBPixels& data, int delay): await4sync_AsyncWker(env, data), m_delay(delay) {}
        ~awaitmsec_AsyncWker() {}
        void Execute() { m_retval = m_fbpx.wait_msec(m_delay); } //CAUTION: executes on different thread
    };
    Napi::Value awaitsec_func(const Napi::CallbackInfo& info)
    {
//        Napi::Env env = info.Env();
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "seconds (Number) expected");
//        /*Napi::Number*/ const auto delay = info[0].As<Napi::Number>();
//        /*int*/ const auto delay_int = delay.Int32Value() * 1e3;
        const auto delay_msec = info[0].As<Napi::Number>().Int32Value() * 1e3;
//sync        int retval = this->fbpx.wait_sec(delay_int); //TODO: async callback
//        return Napi::Number::New(info.Env(), retval);
//        Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(info.Env());
//        (new awaitmsec_AsyncWker(info.Env(), deferred, this->fbpx, delay_int))->Queue();
//        return deferred.Promise();
        awaitmsec_AsyncWker* wker = new awaitmsec_AsyncWker(info.Env(), this->fbpx, delay_msec);
        wker->Queue();
        return wker->GetPromise();
    }
    Napi::Value awaitmsec_func(const Napi::CallbackInfo& info)
    {
//        Napi::Env env = info.Env();
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "milliseconds (Number) expected");
//        /*Napi::Number*/ const auto delay = info[0].As<Napi::Number>();
//        /*int*/ const auto delay_int = delay.Int32Value();
        const auto delay_msec = info[0].As<Napi::Number>().Int32Value();
//sync        int retval = this->fbpx.wait_msec(delay_int); //TODO: async callback
//        return Napi::Number::New(info.Env(), retval);
//broken        Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(info.Env());
//        (new awaitmsec_AsyncWker(info.Env(), deferred, this->fbpx, delay_int))->Queue();
//        return deferred.Promise();
//        Napi::Env env = info.Env();
        awaitmsec_AsyncWker* wker = new awaitmsec_AsyncWker(info.Env(), this->fbpx, delay_msec);
        wker->Queue();
        return wker->GetPromise();
    }
//    Napi::Value PlusOne(const Napi::CallbackInfo& info)
//    {
//        this->value_ = this->value_ + 1;
//        return napi_FBPixels::GetValue(info);
//    }
//    Napi::Value Multiply(const Napi::CallbackInfo& info)
//    {
//        Napi::Number multiple;
//        if (info.Length() <= 0 || !info[0].IsNumber())
//            multiple = Napi::Number::New(info.Env(), 1);
//        else
//            multiple = info[0].As<Napi::Number>();
//        Napi::Object obj =
//            info.Env().GetInstanceData<Napi::FunctionReference>()->New({Napi::Number::New(info.Env(), this->value_ * multiple.DoubleValue())});
//        return obj;
//    }
public: //napi helpers
//exports:
//    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::Object Init(Napi::Env env, Napi::Object exports)
    {
        exports = module_exports(env, exports); //incl prev export(s)
        Napi::Function ctor_func =
            DefineClass(env,
                "FBPixels",
                {
//                    InstanceMethod("plusOne", &napi_FBPixels::PlusOne),
//                    InstanceMethod("value", &napi_FBPixels::GetValue),
//                    InstanceMethod("multiply", &napi_FBPixels::Multiply),
//https://nodejs.github.io/node-addon-api/class_napi_1_1_object_wrap.html
//                    InstanceValue(const char* utf8name,
//                        Napi::Value value,
//                        napi_property_attributes attributes = napi_default),
//                    StaticMethod(const char* utf8name,
//                        StaticVoidMethodCallback method,
//                        napi_property_attributes attributes = napi_default,
//                        void* data = nullptr),
//                    StaticAccessor(Symbol name,
//                        StaticGetterCallback getter,
//                        StaticSetterCallback setter,
//                        napi_property_attributes attributes = napi_default,
//                        void* data = nullptr),
//                    StaticValue(const char* utf8name,
//                        Napi::Value value,
//                        napi_property_attributes attributes = napi_default),
//                    InstanceAccessor(const char* utf8name,
//                        InstanceGetterCallback getter,
//                        InstanceSetterCallback setter,
//                        napi_property_attributes attributes = napi_default,
//                        void* data = nullptr),
                    InstanceAccessor("isOpen", &napi_FBPixels::isOpen_getter, 0), //&napi_FBPixels::dummy_setter) //, napi_default, nullptr),
                    InstanceAccessor("width", &napi_FBPixels::width_getter, 0),
                    InstanceAccessor("height", &napi_FBPixels::height_getter, 0),
                    InstanceAccessor("bpp", &napi_FBPixels::bpp_getter, 0),
                    InstanceAccessor("numfr", &napi_FBPixels::numfr_getter, 0),
                    InstanceAccessor("fps", &napi_FBPixels::fps_getter, 0),
                    InstanceAccessor("slept", &napi_FBPixels::slept_getter, 0),
                    InstanceAccessor("pixels", &napi_FBPixels::pixels_getter, 0),
                    InstanceAccessor("dirty", &napi_FBPixels::dirty_getter, &napi_FBPixels::dirty_setter),
                    InstanceAccessor("elapsed", &napi_FBPixels::elapsed_getter, &napi_FBPixels::elapsed_setter),
//                    InstanceMethod("clear", &napi_FBPixels::clear_func),
                    InstanceMethod("fill", &napi_FBPixels::fill_func),
                    InstanceMethod("row", &napi_FBPixels::row_func),
                    InstanceMethod("col", &napi_FBPixels::col_func),
                    InstanceMethod("pixel", &napi_FBPixels::pixel_func),
                    InstanceMethod("await4sync", &napi_FBPixels::await4sync_func),
                    InstanceMethod("await_sec", &napi_FBPixels::awaitsec_func),
                    InstanceMethod("await_msec", &napi_FBPixels::awaitmsec_func),
                }); //??, new FBPixels<>());
//Napi::Value Example::GetValue(const Napi::CallbackInfo &info){
//    Napi::Env env = info.Env();
//    return Napi::Number::New(env, this->_value);
//}
//Napi::Value Example::SetValue(const Napi::CallbackInfo &info){
//    Napi::Env env = info.Env();
//    // ...
//    Napi::Number value = info[0].As<Napi::Number>();
//    this->_value = value.DoubleValue();
//    return this->GetValue(info);
//}
//static T* Napi::ObjectWrap::Unwrap(Napi::Object wrapper);
        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(ctor_func);
//??        constructor.SuppressDestruct();
        env.SetInstanceData(constructor);
        exports.Set("FBPixels", ctor_func); //add new export(s)
        return exports;
    }
#undef module_exports
#define module_exports  napi_FBPixels::Init
};


class napi_WS281x: public Napi::ObjectWrap<napi_WS281x>
{
    using self = napi_WS281x;
public: //ctors/dtors
    napi_WS281x(const Napi::CallbackInfo& args): Napi::ObjectWrap<napi_WS281x>(args) {}
private: //members
    WS281x wspx;
public: //getters/setters
    Napi::Value isOpen_getter(const Napi::CallbackInfo &info)
    {
//        Napi::Env env = info.Env();
        return Napi::Number::New(info.Env(), this->wspx.isOpen());
    }
public: //napi helpers
//exports:
    static Napi::Object Init(Napi::Env env, Napi::Object exports)
    {
        exports = module_exports(env, exports); //incl prev export(s)
        Napi::Function ctor_func =
            DefineClass(env,
                "WS281x",
                {
                    InstanceAccessor("isOpen", &napi_WS281x::isOpen_getter, 0),
//                    InstanceAccessor("width", &napi_FBPixels::width_getter, 0),
//                    InstanceAccessor("height", &napi_FBPixels::height_getter, 0),
//                    InstanceAccessor("pixels", &napi_FBPixels::pixels_getter, 0),
//                    InstanceAccessor("dirty", &napi_FBPixels::dirty_getter, &napi_FBPixels::dirty_setter),
//                    InstanceAccessor("elapsed", &napi_FBPixels::elapsed_getter, &napi_FBPixels::elapsed_setter),
//                    InstanceMethod("clear", &napi_FBPixels::clear_func),
//                    InstanceMethod("await4sync", &napi_FBPixels::await4sync_func),
                }); //??, new WS281x());
//static T* Napi::ObjectWrap::Unwrap(Napi::Object wrapper);
        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(ctor_func);
//??        constructor.SuppressDestruct();
        env.SetInstanceData(constructor);
        exports.Set("WS281x", ctor_func); //add new export(s)
        return exports;
    }
#undef module_exports
#define module_exports  napi_WS281x::Init
};


//Napi::String Method(const Napi::CallbackInfo& info)
//{
//  Napi::Env env = info.Env();
//  return Napi::String::New(env, "world");
//}

//export additional global props:
//DRY: do these in Node.js addon rather than in Javascript
Napi::Object ExportGlobals(Napi::Env env, Napi::Object exports)
{
    exports = module_exports(env, exports); //incl prev export(s)

    const bool noGUI = isatty(fileno(stdin)); //https://stackoverflow.com/questions/13204177/how-to-find-out-if-running-from-terminal-or-gui
//DRY    const bool isXWindows = !!getenv("DISPLAY");
    const bool isXTerm = !!getenv("TERM");
    const bool isSSH = !!getenv("SSH_CLIENT");

//add new exports:
    exports.Set("noGUI", Napi::Number::New(env, noGUI));
    exports.Set("isXWindows", Napi::Number::New(env, FBIO::isXWindows));
    exports.Set("isXTerm", Napi::Number::New(env, isXTerm));
    exports.Set("isSSH", Napi::Number::New(env, isSSH));
    exports.Set("isRPi", Napi::Number::New(env, FBIO::isRPi));
    return exports;
}
#undef module_exports
#define module_exports  ExportGlobals


//Napi::Object napi_shim(Napi::Env env, Napi::Object exports)
//{
//    return module_exports(napi_thing(env, exports)).obj;
//}
/*NAPI_MODULE*/NODE_API_MODULE(NODE_GYP_MODULE_NAME, module_exports) //cumulative exports; put at end to export everything defined above
#endif //def NODE_GYP_MODULE_NAME


///////////////////////////////////////////////////////////////////////////////
////
/// CLI:
//

#ifndef NODE_GYP_MODULE_NAME
#pragma message(CYAN_MSG "compiled for stand-alone (non-Node) usage" ENDCOLOR_NOLINE)

#include <cstdio> //fileno()
#include <unistd.h> //isatty()


//WS281X test using Linux framebuffer:
//https://www.kernel.org/doc/Documentation/fb/api.txt
int main(int argc, char* argv[])
{
//    setlocale(LC_ALL, ""); //enable %'d commas in printf
    const bool noGUI = isatty(fileno(stdin)); //https://stackoverflow.com/questions/13204177/how-to-find-out-if-running-from-terminal-or-gui
//    const bool isXWindows = !!getenv("DISPLAY");
    const bool isXTerm = !!getenv("TERM");
    const bool isSSH = !!getenv("SSH_CLIENT");
    debug("running X-Windows? %d, gui? %d, xterm? %d, ssh? %d, RPi? %d", FBIO::isXWindows, !noGUI, isXTerm, isSSH, FBIO::isRPi);

debug("(ext) colors: red 0x%x, green 0x%x, blue 0x%x", ::RED, ::GREEN, ::BLUE);
//debug("internal: red 0x%x, green 0x%x, blue 0x%x", color_t(::RED).uint32, color_t(::GREEN).uint32, color_t(::BLUE).uint32);
//return 0;
//rel time test:
//    for (int i = 0; i < 10; ++i)
//    {
//        debug("time[%d] %'d", i, time2msec());
//        sleep(1);
//    }
//    exit(1);

    FBPixels fb; //("/dev/fb1");
    if (!fb.isOpen()) return(1);
    const int width = fb.width(), height = fb.height();
//    printf("The framebuffer device opened.\n");
//        auto scrinfo = fb.screeninfo();
//        if (scrinfo) printf("Display info: %'d x %'d (%'d px), aspect %3.2f, %d bpp\n", scrinfo->var.xres, scrinfo->var.yres, scrinfo->var.xres * scrinfo->var.yres, (double)scrinfo->var.xres / scrinfo->var.yres, scrinfo->var.bits_per_pixel );
    debug(CYAN_MSG "Display info: %'d x %'d (%'d px), aspect %3.2f, %d bpp", width, height, width * height, (double)width / height, fb.bpp());

//test frame rate:
//        sleep(3);
    debug("frame rate test (10 sec) ...");
    fb.elapsed(0); //reset stopwatch
//debug("here1");
    for (int fr = 0; fb.elapsed() < 10e3; ++fr) //fr < 5*30
//        {
//            /*if (!(fr % 60))*/ debug("%'d frames", fr);
//debug("here2");
        fb.wait4sync();
//        }
//    auto numfr = fb.numfr();
//    auto elapsed = fb.elapsed(); //time2msec();
//debug("here3");
    debug(CYAN_MSG "%'d frames, %4.3f sec = %3.2f fps, slept %4.3f sec (%2.1f%%)", fb.numfr(), fb.elapsed() / 1e3, fb.fps(), fb.slept / 1e3, 100.0 * fb.slept / fb.elapsed());
    fb.wait_sec(3);

//screen tests:
    struct { const char* name; uint32_t value; }
    colors[] =
    {
        {"red", ::RED}, {"green", ::GREEN}, {"blue", ::BLUE},
        {"yellow", ::YELLOW}, {"cyan", ::CYAN}, {"magenta", ::MAGENTA},
        {"white", ::WHITE}, {"warm white", ::WARM_WHITE}, {"cool white", ::COOL_WHITE},
        {"black", ::BLACK}
    };
    debug("fill test (%lu x 3 sec) ...", SIZEOF(colors));
//        fb.fill(::WHITE_low);
//        sleep(3);
    for (auto cp = &colors[0]; cp < &colors[SIZEOF(colors)]; ++cp)
    {
        debug("%s 0x%x", cp->name, cp->value);
        fb.fill(cp->value);
        fb.wait_sec(3);
    }
//return 0;
    debug("px @%p, row[0] @%p, row[1] @%p, px[0][0] @%p, px[0][1] @%p, px[1][0] @%p", &fb.pixels, &fb.pixels[0], &fb.pixels[1], &fb.pixels[0][0], &fb.pixels[0][1], &fb.pixels[1][0]);
    for (int mode = 1; mode <= 3; ++mode)
    {
        debug("row test[%d] (%'d sec) ...", mode, (int)(height / fb.fps()));
        fb.elapsed(0); //reset stopwatch
        const color_t color = ::YELLOW; //_low; //(0xFF, 0, 0x80, 0x80); //dim red
//        const int w = 10, h = 10;
        for (int y = 0; y < height; ++y)
        {
            if (mode == 1) //low overhead; BEST perf on Intel
                fb.row(y, color); //_low);
            else if (mode == 2) //js typed array; MID perf on Intel
            {
//                uint32_t* row = fb.pixels[y];
                for (int x = 0; x < width; ++x)
                    fb.pixels[y][x] = color; //= color; //.fromARGB(0xff, 0x00, 0x80, 0x80);
                fb.dirty(true);
            }
            else //low bandwidth/high overhead; SLOWEST on Intel
                for (int x = 0; x < width; ++x)
                    fb.pixel(x, y, color); //= color; //.fromARGB(0xff, 0x00, 0x80, 0x80);
//            /*if (!(fr % 60))*/ debug("%'d frames", y);
            fb.wait4sync(); //row-by-row fill
        }
//printf("here2\n");
        debug(CYAN_MSG "%'d rows (%'d frames) 0x%x, %4.3f sec = %3.2f fps, slept %4.3f sec (%2.1f%%)", height, fb.numfr(), (uint32_t)color/*.uint32*/, fb.elapsed() / 1e3, fb.fps(), fb.slept / 1e3, 100.0 * fb.slept / fb.elapsed());
//        if (mode == 1) break; //BROKEN
        fb.fill(BLACK);
    }
    fb.wait_sec(3);

//row/col test:
    debug("grid test (%'d sec) ...", (int)((width + height) / 100 * .1e3 / 1e3));
    fb.fill(::BLACK);
    fb.elapsed(0); //reset stopwatch
    for (int y = 0; y < height; y += 100)
    {
        fb.row(y, ::RED); //_low);
        fb.wait_msec(.1e3);
    }
    for (int x = 0; x < width; x += 100)
    {
        fb.col(x, ::GREEN); //_low);
        fb.wait_msec(.1e3);
    }
    debug(CYAN_MSG "%'d rows + %'d cols = %'d frames, %4.3f sec = %3.2f fps, slept %4.3f sec (%2.1f%%)", height / 100, width / 100, fb.numfr(), fb.elapsed() / 1e3, fb.fps(), fb.slept / 1e3, 100.0 * fb.slept / fb.elapsed());
    fb.wait_sec(5); //give time to see before closing

    return(0);
}
#endif //ndef NODE_GYP_MODULE_NAME

//eof