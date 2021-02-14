///////////////////////////////////////////////////////////////////////////////
//GpuPort.cpp - Node.js add-on to use GPU as a 24-bit parallel port
//primary purpose: drive 24 channels of WS281X pixels from a RPi

//to build as Node.js add-on:
//  npm install
//to build as stand-alone test:
//  g++ <me>.cpp -o <me>  #`sdl2-config &>/dev/null && echo \"-DHAS_SDL\")"`
//NOTE: assumes libSDL2 is installed and headers are on INCLUDE_DIRs env var
//no       `type -p X &>/dev/null && echo \"-DHAS_XWINDOWS\"` #for dev/debug only; installed, but might not be running
//no       `sdl2-config &>/dev/null && echo \"-DHAS_SDL\")"` #for live show
//or:  make <me>
//run:
//  [sudo]  <me>
//  (on RPi, "sudo" needed unless effective uid is member of video group)


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
#include <type_traits> //std::remove_cvref<>, std::conditional<>, std::if_same<>, std::decay<>, std::remove_reference<>, std::remove_pointer<>
#include <cstdint> //uint32_t etc
#include <clocale> //setlocale()

#include <stdio.h> //printf(), open(), close()
//#include <string.h> //snprintf()
//#include <ctype.h> //isxdigit()
//#include <sys/stat.h> //struct stat
#include <cstdint> //uint32_t
#include <sstream> //std::ostringstream
//#include <memory.h> //memmove()
#include <algorithm> //std::min<>(), std::max<>()

//#define NODEJS_ADDON //selected by gyp bindings
//#ifdef NODEJS_ADDON
// #pragma message("compiled as Node.js add-on")
//#else
// #pragma message("compiled for stand-alone usage")
//#endif


///////////////////////////////////////////////////////////////////////////////
////
/// helper macros
//

//debug helpers:
//#define debug(msg)  printf(BLUE_MSG msg ENDCOLOR_ATLINE)
//TODO: allow 1 arg in debug()
static const char* dummy = setlocale(LC_ALL, ""); //enable %'d commas in printf

static int prevout = 0;
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


//perfect forwarding:
#define PERF_FWD(from, to)  \
template <typename ... ARGS>  \
/*decltype(to(ARGS&& ... args))*/ auto from(ARGS&& ... args) { return to(std::forward<ARGS>(args) ...); }


//kludge: compiler doesn't like "return (void)expr" so fake it
#define RETURN(...) { __VA_ARGS__; return; }

//compile-time length of array:
#define SIZEOF(thing)  (sizeof(thing) / sizeof((thing)[0]))


//convert to string + force macro expansion:
#ifndef TOSTR
 #define TOSTR(str)  TOSTR_NESTED(str)
 #define TOSTR_NESTED(str)  #str //kludge: need nested level to force expansion
#endif


//accept variable #macro args:
#ifndef UPTO_2ARGS
 #define UPTO_2ARGS(arg1, arg2, func, ...)  func
#endif
#ifndef UPTO_3ARGS
 #define UPTO_3ARGS(arg1, arg2, arg3, func, ...)  func
#endif
#ifndef UPTO_4ARGS
 #define UPTO_4ARGS(arg1, arg2, arg3, arg4, func, ...)  func
#endif
#ifndef UPTO_16ARGS
 #define UPTO_16ARGS(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16, func, ...)  func
#endif
//#define STATIC_WRAP_2ARGS(TYPE, VAR)  STATIC_WRAP_3ARGS(TYPE, VAR, INIT_NONE) //optional third param
//#define STATIC_WRAP(...)  UPTO_3ARGS(__VA_ARGS__, STATIC_WRAP_3ARGS, STATIC_WRAP_2ARGS, STATIC_WRAP_1ARG) (__VA_ARGS__)
//#define STATIC_WRAP  STATIC_WRAP_3ARGS


///////////////////////////////////////////////////////////////////////////////
////
/// color handling + definitions
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
#define GRAY_MSG  ANSI_COLOR("0;37") //dim is okay
#define ENDCOLOR_NOLINE  ANSI_COLOR("0")
#define ENDCOLOR_NEWLINE  ENDCOLOR_NOLINE "\n"
#define ENDCOLOR_ATLINE  SRCLINE ENDCOLOR_NEWLINE


#if 0
//primary RGB colors:
//NOTE: caller always sees ARGB byte order; FB class will swap byte order internally if needed
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
#if 1
//primary RGB colors:
//NOTE: caller always sees ARGB byte order; FB class will swap byte order internally if needed
constexpr uint32_t RED = 0xFFff0000;
constexpr uint32_t GREEN = 0xFF00ff00;
constexpr uint32_t BLUE = 0xFF0000ff;
constexpr uint32_t YELLOW = 0xFFffff00;
constexpr uint32_t CYAN = 0xFF00ffff;
constexpr uint32_t MAGENTA = 0xFFff00ff;
constexpr uint32_t WHITE = 0xFFffffff;
constexpr uint32_t WARM_WHITE = 0xFFffffb4; //h 60/360, s 30/100, v 1.0 //try to simulate incandescent
constexpr uint32_t COOL_WHITE = 0xFFccccff;
constexpr uint32_t BLACK = 0xFF000000; //NOTE: all off still needs alpha
constexpr uint32_t XPARENT = 0; //no alpha

constexpr uint32_t RED_low = 0xFF1f0000;
constexpr uint32_t GREEN_low = 0xFF001f00;
constexpr uint32_t BLUE_low = 0xFF00001f;
constexpr uint32_t YELLOW_low = 0xFF1f1f00;
constexpr uint32_t CYAN_low = 0xFF001f1f;
constexpr uint32_t MAGENTA_low = 0xFF1f001f;
constexpr uint32_t WHITE_low = 0xFF1f1f1f;
#endif


//color byte order:
//external (caller) byte order can always use ARGB notation for color consts
//internal (FB) byte order depends on endianness; RPi wants BGRA
//macros should be used to xlate colors in/out of FB order
#if 1
 #pragma message(CYAN_MSG "Intel byte order: RGBA (hard-coded)" ENDCOLOR_NOLINE)
 #define ASHIFT 0
 #define RSHIFT 8
 #define GSHIFT 16
 #define BSHIFT 24
#elif 1 //RPi
 #pragma message(CYAN_MSG "RPi byte order: AGRB (hard-coded)" ENDCOLOR_NOLINE)
//TODO: figure out why byte order is strange on RPi
//NOTE: this doesn't matter anyway with pivot24; just swap channels/wires to fix
 #define ASHIFT 24
 #define RSHIFT 8
 #define GSHIFT 16
 #define BSHIFT 0
#elif defined(__BIG_ENDIAN__) || (defined(__BYTE_ORDER) && (__BYTE_ORDER == __BIG_ENDIAN))
// || defined(__ARMEB__) || defined(__THUMBEB__) || defined(__AARCH64EB__) || defined(_MIBSEB) || defined(__MIBSEB) || defined(__MIBSEB__)
 #pragma message(CYAN_MSG "big endian (risc?)" ENDCOLOR_NOLINE)
 #define ASHIFT 24
 #define RSHIFT 16
 #define GSHIFT 8
 #define BSHIFT 0
// #define Amask(color)  ((color) & 0xff000000)
// #define Rmask(color)  ((color) & 0x00ff0000)
// #define Gmask(color)  ((color) & 0x0000ff00)
// #define Bmask(color)  ((color) & 0x000000ff)
// #define A(color)  (Amask(color) >> 24)
// #define R(color)  (Rmask(color) >> 16)
// #define G(color)  (Gmask(color) >> 8)
// #define B(color)  (Bmask(color) >> 0)
#elif defined(__LITTLE_ENDIAN__) || (defined(__BYTE_ORDER) && (__BYTE_ORDER == __LITTLE_ENDIAN))
// || defined(__ARMEL__) || defined(__THUMBEL__) || defined(__AARCH64EL__) || defined(_MIPSEL) || defined(__MIPSEL) || defined(__MIPSEL__)
 #pragma message(CYAN_MSG "little endian (RPi, Intel)" ENDCOLOR_NOLINE)
 #define ASHIFT 0
 #define RSHIFT 8
 #define GSHIFT 16
 #define BSHIFT 24
// #define Amask(color)  ((color) & 0x000000ff)
// #define Rmask(color)  ((color) & 0x0000ff00)
// #define Gmask(color)  ((color) & 0x00ff0000)
// #define Bmask(color)  ((color) & 0xff000000)
// #define A(color)  (Amask(color) >> 0)
// #define R(color)  (Rmask(color) >> 8)
// #define G(color)  (Gmask(color) >> 16)
// #define B(color)  (Amask(color) >> 24)
#else
 #error RED_MSG "Unknown endianness." ENDCOLOR_NOLINE
#endif

//#define lrshift(val, pos)  (((pos) < 0)? ((val) << -(pos)): ((val) >> (pos)))

//clamp byte:
//TODO: fix this; currently it is "wrap" rather than "clamp"
#define cbyte_1ARG(val)  cbyte_2ARGS(val, 0) //((val) & 0xFF)
#define cbyte_2ARGS(val, shift)  cbyte_3ARGS(val, shift, 0xFF)
#define cbyte_3ARGS(val, shift, mask)  (((shift) < 0)? ((val) & ((mask) << -(shift))): ((val) >> (shift)) & (mask))
#define cbyte(...)  UPTO_3ARGS(__VA_ARGS__, cbyte_3ARGS, cbyte_2ARGS, cbyte_1ARG) (__VA_ARGS__)


//CAUTION: external fmt:
#define A(color)  cbyte(color, 24) //ASHIFT)
#define R(color)  cbyte(color, 16) //RSHIFT)
#define G(color)  cbyte(color, 8) //GSHIFT)
#define B(color)  cbyte(color, 0) //BSHIFT)
#define R_G_B_A(color)  R(color), G(color), B(color), A(color)
#define A_R_G_B(color)  A(color), R(color), G(color), B(color)

#define ABITS(color)  cbyte(color, -24) //-ASHIFT)
#define RGB_BITS(color)  ((color) & ~ABITS(0xFFffffff))
#define RBITS(color)  cbyte(color, -16) //-RSHIFT)
#define GBITS(color)  cbyte(color, -8) //-GSHIFT)
#define BBITS(color)  cbyte(color, -0) //-BSHIFT)

//from external (caller) ARGB order to internal (FB) order:
#define fromARGB_1ARG(argb)  fromARGB_4ARGS(((argb) >> 24)? ((argb) >> 24): ((argb) & 0xffffff)? 0xFF: 0, (argb) >> 16, (argb) >> 8, (argb) >> 0) //conditional full alpha; NOTE: from external ARGB order
#define fromARGB_3ARGS(r, g, b)  fromARGB_4ARGS(0xFF, r, g, b) //default full alpha
#define fromARGB_4ARGS(a, r, g, b)  (ABITS(a) | RBITS(r) | GBITS(g) | BBITS(b))
#define fromARGB(...)  UPTO_4ARGS(__VA_ARGS__, fromARGB_4ARGS, fromARGB_3ARGS, fromARGB_2ARGS, fromARGB_1ARG) (__VA_ARGS__)

//from internal (FB) order to external (caller) ARGB order:
//#define toARGB(color)  ((A(color) << 24) | (R(color) << 16) | (G(color) << 8) | (B(color) << 0))


//color struct:
//for portability, caller can use separate A/R/G/B when constructing colors
//internal RPi FB order is actually BGRA; using this struct remembers byte order has already been corrected for internal use
struct color_t //: public uint32_t
{
//    using isARGB = false;
//members:
//    uint8_t a, r, g, b; 
    uint32_t m_color; //stored in FB preferred byte order (BGRA on RPi)
//ctors/dtors:
//converts external to internal byte order
    color_t(): m_color(0) {} //no alpha
    color_t(const color_t& other): m_color(other.m_color) {} //no byte swapping
    color_t(uint32_t argb): m_color(fromARGB(argb)) {} //argb_t(argb >> 24, argb >> 16, argb >> 8, argb >> 0) {};
    color_t(uint8_t r, uint8_t g, uint8_t b): m_color(fromARGB(r, g, b)) {} //argb_t(255, r, g, b) {}; //default full alpha
    color_t(uint8_t a, uint8_t r, uint8_t g, uint8_t b): m_color(fromARGB(a, r, g, b)) {}
//helpers:
//    uint8 A() const { return}
//operators:
//    operator int() const { return(m_color); } //toARGB(m_argb)); }
//    operator uint32_t() const { return(m_color); } //toARGB(m_argb)); }
#if 0 //broken (can't get const member init compiled); not needed anyway
//primary RGB colors (already using internal byte order):
//NOTE: caller always sees ARGB byte order; FB class will swap byte order internally if needed
    static constexpr argb_t XPARENT = 0; //no alpha; R/G/B can be any value but just use 0 so caller can use R/G/B for other purposes
    static constexpr argb_t BLACK; //= fromARGB(0xFF000000); //CAUTION: still needs alpha
    static constexpr argb_t RED; //= fromARGB(0xFFff0000); //(0xFF, 0xFF, 0, 0);
    static constexpr argb_t GREEN; //= fromARGB(0xFF00ff00); //(0xFF, 0, 0xFF, 0);
    static constexpr argb_t BLUE; //= fromARGB(0xFF0000ff); //(0xFF, 0, 0, 0xFF);
    static constexpr argb_t YELLOW; //= fromARGB(0xFFffff00); //(0xFF, 0xFF, 0xFF, 0);
    static constexpr argb_t CYAN; //= fromARGB(0xFF00ffff); //(0xFF, 0, 0xFF, 0xFF);
    static constexpr argb_t MAGENTA; //= fromARGB(0xFFff00ff); //(0xFF, 0xFF, 0, 0xFF);
    static constexpr argb_t WHITE; //= fromARGB(0xFFffffff); //(0xFF, 0xFF, 0xFF, 0xFF);
    static constexpr argb_t WARM_WHITE; //= fromARGB(0xFFffff99); //ffffb4; //h 60/360, s 30/100, v 1.0
    static constexpr argb_t COOL_WHITE; //= fromARGB(0xFF9999ff); //b4b4ff; //h 60/360, s 30/100, v 1.0
//use low brightness to reduce eye burn during prolonged testing:
    static constexpr argb_t RED_low; //= fromARGB(0xFF1f0000);
    static constexpr argb_t GREEN_low; //= fromARGB(0xFF001f00);
    static constexpr argb_t BLUE_low; //= fromARGB(0xFF00001f);
    static constexpr argb_t YELLOW_low; //= fromARGB(0xFF1f1f00);
    static constexpr argb_t CYAN_low; //= fromARGB(0xFF001f1f);
    static constexpr argb_t MAGENTA_low; //= fromARGB(0xFF1f001f);
    static constexpr argb_t WHITE_low; //= fromARGB(0xFF1f1f1f);
#endif
    static const color_t RED(A_R_G_B(::RED));
    static const color_t GREEN(A_R_G_B(::GREEN));
    static const color_t BLUE(A_R_G_B(::BLUE));
    static const color_t YELLOW(A_R_G_B(::YELLOW));
    static const color_t CYAN(A_R_G_B(::CYAN));
    static const color_t MAGENTA(A_R_G_B(::MAGENTA));
    static const color_t WHITE(A_R_G_B(::WHITE));
    static const color_t WARM_WHITE(A_R_G_B(::WARM_WHITE));
    static const color_t COOL_WHITE(A_R_G_B(::COOL_WHITE));
};


#if 0
//primary RGB colors:
//NOTE: caller always sees ARGB byte order; FB class will swap around internally if needed
#define RED  0xff0000ff
#define GREEN  0xff00ff00
#define BLUE  0xffff0000
#define YELLOW  0xff00ffff
#define CYAN  0xffffff00
#define MAGENTA  0xffff00ff
#define WHITE  0xffffffff
#define WARM_WHITE  0xffffffb4 //h 60/360, s 30/100, v 1.0
#define BLACK  0xff000000 //NOTE: need alpha
#define XPARENT  0 //no alpha

#define A(color)  (Amask(color) >> 24)
#define R(color)  (Rmask(color) >> 16)
#define G(color)  (Gmask(color) >> 8)
#define B(color)  Bmask(color)
#define Amask(color)  ((color) & 0xff000000)
#define Rmask(color)  ((color) & 0x00ff0000)
#define Gmask(color)  ((color) & 0x0000ff00)
#define Bmask(color)  ((color) & 0x000000ff)

#ifdef LIMIT_BRIGHTNESS
 #define SUM(color)  (R(color) + G(color) + B(color))
 #define LIMIT(color)  IIF(SUM(color) > LIMIT_BRIGHTNESS, \
    Amask(color) | \
    ((R(color) * LIMIT_BRIGHTNESS / SUM(color)) << 16) | \
    ((G(color) * LIMIT_BRIGHTNESS / SUM(color)) << 8) | \
    (B(color) * LIMIT_BRIGHTNESS / SUM(color)), \
    color)
#else
 #define LIMIT(color)  color
#endif

//convert color ARGB <-> ABGR format:
//OpenGL seems to prefer ABGR format, but RGB order is more readable (for me)
//convert back with same function & 0xffffff
//TODO: drop alpha setting?
//??	if (!Amask(color) /*&& (color & 0xffffff)*/) color |= 0xff000000; //RGB present but no alpha; add full alpha to force color to show
#define ARGB2ABGR(color)  \
	(Amask(color) | (Rmask(color) >> 16) | Gmask(color) | (Bmask(color) << 16)) //swap R, B
#define SWAP32(uint32)  \
    ((Amask(uint32) >> 24) | (Rmask(uint32) >> 8) | (Gmask(uint32) << 8) | (Bmask(uint32) << 24))
#endif //0


#if 0
//#define RGSWAP(rgb24)  ((((rgb24) >> 8) & 0xff00) | (((rgb24) << 8) & 0xff0000) | ((rgb24) & 0xff0000ff))
//#define ARGB2BGRA(argb)  RGSWAP(((argb) >> 24) | ((argb) << 24)) //((((argb) >> 24) & 0xFF) | (((argb) << 24) & 0xFF000000) |

//ARGB struct:
//CAUTION: RPi FB order is actually BGRA
struct argb_t //: public uint32_t
{
//    using isARGB = false;
//members:
    uint32_t m_argb; //uint8_t a, r, g, b;
//ctors/dtors:
    argb_t(): m_argb(0) {}; //a(0), r(0), g(0), b(0)
    argb_t(uint32_t argb): m_argb(ARGB2BGRA(argb)) {};
    argb_t(uint8_t a, uint8_t r, uint8_t g, uint8_t b): m_argb(fromARGB(a, r, g, b)) {};
    argb_t(uint8_t r, uint8_t g, uint8_t b): m_argb(fromARGB(0xff, r, g, b)) {};
//operators:
    operator int() const { return(m_argb); }
    operator uint32_t() const { return(m_argb); }
//helpers:
//assumes compiler will truncate bits accordingly
#if 0 //ARGB
    static argb_t fromARGB(uint8_t a, uint8_t r, uint8_t g, uint8_t b)
    {
        return((a << 24) | (r << 16) | (g << 8) | (b << 0));
    }
    static uint8_t A(uint32_t argb) { return(argb >> 24); }
    static uint8_t R(uint32_t argb) { return(argb >> 16); }
    static uint8_t G(uint32_t argb) { return(argb >> 8); }
    static uint8_t B(uint32_t argb) { return(argb >> 0); }
//#else
    static argb_t fromARGB(uint8_t a, uint8_t r, uint8_t g, uint8_t b)
    {
        return((a << 0) | (r << 8) | (g << 16) | (b << 24));
    }
//    static uint8_t A(uint32_t argb) { return(argb >> 0); }
//    static uint8_t R(uint32_t argb) { return(argb >> 8); }
//    static uint8_t G(uint32_t argb) { return(argb >> 16); }
//    static uint8_t B(uint32_t argb) { return(argb >> 24); }
#endif //0
//TODO: HSV, clamping, etc
public: //members
//primary RGB colors (A set to max):
//NOTE: only ints can be statically init'ed in-class, so use hex consts here
//use "constexpr" to allow compile-time reductions
//NOTE: caller always sees ARGB byte order; FB class will swap around internally if needed
//    static const argb_t BLACK = 0xFF000000; //(0xFF, 0, 0, 0);
    static constexpr uint32_t XPARENT = 0; //no alpha; R/G/B can be any value but just use 0 so caller can use R/G/B for other purposes
    static constexpr uint32_t BLACK = 0xFF000000; //CAUTION: still needs alpha
    static constexpr uint32_t RED = 0xFFff0000; //(0xFF, 0xFF, 0, 0);
    static constexpr uint32_t GREEN = 0xFF00ff00; //(0xFF, 0, 0xFF, 0);
    static constexpr uint32_t BLUE = 0xFF0000ff; //(0xFF, 0, 0, 0xFF);
    static constexpr uint32_t YELLOW = 0xFFffff00; //(0xFF, 0xFF, 0xFF, 0);
    static constexpr uint32_t CYAN = 0xFF00ffff; //(0xFF, 0, 0xFF, 0xFF);
    static constexpr uint32_t MAGENTA = 0xFFff00ff; //(0xFF, 0xFF, 0, 0xFF);
    static constexpr uint32_t WHITE = 0xFFffffff; //(0xFF, 0xFF, 0xFF, 0xFF);
    static constexpr uint32_t WARM_WHITE = 0xFFffff99; //ffffb4; //h 60/360, s 30/100, v 1.0
    static constexpr uint32_t COOL_WHITE = 0xFF9999ff; //b4b4ff; //h 60/360, s 30/100, v 1.0
//use low brightness to reduce eye burn during prolonged testing:
    static constexpr uint32_t RED_low = 0xFF1f0000;
    static constexpr uint32_t GREEN_low = 0xFF001f00;
    static constexpr uint32_t BLUE_low = 0xFF00001f;
    static constexpr uint32_t YELLOW_low = 0xFF1f1f00;
    static constexpr uint32_t CYAN_low = 0xFF001f1f;
    static constexpr uint32_t MAGENTA_low = 0xFF1f001f;
    static constexpr uint32_t WHITE_low = 0xFF1f1f1f;
//elements:
//
//#define A(color)  (Amask(color) >> 24)
//#define R(color)  (Rmask(color) >> 16)
//#define G(color)  (Gmask(color) >> 8)
//#define B(color)  Bmask(color)
//    static constexpr uint8_t A(const uint32_t argb) { return(argb >> 24); }
//    static constexpr uint8_t R(const uint32_t argb) { return(argb >> 16); }
//    static constexpr uint8_t G(const uint32_t argb) { return(argb >> 8); }
//    static constexpr uint8_t B(const uint32_t argb) { return(argb >> 0); }
//masks:
//    static constexpr uint32_t Amask(const uint32_t color) { return((color) & 0xFF000000); }
//    static constexpr uint32_t Rmask(const uint32_t color) { return((color) & 0x00ff0000); }
//    static constexpr uint32_t Gmask(const uint32_t color) { return((color) & 0x0000ff00); }
//    static constexpr uint32_t Bmask(const uint32_t color) { return((color) & 0x000000ff); }
//composition:
//    static constexpr uint32_t fromARGB(uint8_t a, uint8_t r, uint8_t g, uint8_t b)
//    {
//        return((a << 0) | (r << 8) | (g << 16) | (b << 24)); //internal format
//    }
//    static constexpr uint32_t fromARGB(uint32_t argb)
//    {
//        return((A(argb) << 0) | (R(argb) << 8) | (Gg << 16) | (b << 24)); //internal format
//    }
#ifdef LIMIT_BRIGHTNESS
 #define SUM(color)  (R(color) + G(color) + B(color))
 #define LIMIT(color)  IIF(SUM(color) > LIMIT_BRIGHTNESS, \
    Amask(color) | \
    ((R(color) * LIMIT_BRIGHTNESS / SUM(color)) << 16) | \
    ((G(color) * LIMIT_BRIGHTNESS / SUM(color)) << 8) | \
    (B(color) * LIMIT_BRIGHTNESS / SUM(color)), \
    color)
#else
 #define LIMIT(color)  color
#endif
};
#endif


///////////////////////////////////////////////////////////////////////////////
////
/// helper functions
//

#include <sys/time.h> //struct timeval, struct timezone
#include <time.h> //struct timespec
#include <stdio.h>
#include <stdarg.h> //va_list, va_start(), va_end()
#include <limits> //std::numeric_limits<>
#include <SDL.h>


//convert time struct to msec:
//just use built-in struct; don't need high-precsion; TODO?
//relative to first time
/*long*/ int time2msec(struct timeval* tv) 
{
    static long int started = 0;
    long int msec = tv->tv_sec * 1e3 + tv->tv_usec / 1e3; //"int" could wrap
//long int sv_st = started;
    if (!started) started = msec - 1; //make result non-0
//debug("sec %ld, usec %ld => msec %ld, st %ld => %ld wrt %ld", tv->tv_sec, tv->tv_usec, msec, sv_st, msec - started, started);
    msec -= started; //relative to first time called
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

//void wait_usec(size_t usec) { usleep(usec); }
//void wait_msec(size_t msec) { usleep(msec * 1e3); }
//void wait_sec(size_t sec) { sleep(sec); } //usleep(sec * 1e6); }

//no worky
//struct Vargs
//{
//    va_list args;
//public: //ctors/dtors
//    Vargs(const char*& fmt) { va_start(args, fmt); }
//    ~Vargs() { va_end(args); }
//public: //operators
////    operator va_list() { return args; }
//};
    

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
//#define SRCLINE  "  @" __FILE__ ":" TOSTR(__LINE__)
//#define ENDCOLOR_ATLINE  SRCLINE ENDCOLOR_NEWLINE
//    fprintf(stderr, RED_MSG "%s error: %s.%s" ENDCOLOR_ATLINE, desc, std::strerror(errno), &try_sudo[isroot? msglen: 0], std::forward<ARGS>(args) ...);
    char fmt[256]; //composite msg fmt string
//    static int isdup = 0;
    static char prevfmt[sizeof(fmt)] = {0};
    snprintf(fmt, sizeof(fmt), "\n" RED_MSG "%s error: %s.%s%s" ENDCOLOR_NEWLINE, desc, reason, &try_sudo[isroot? msglen: 0], srcline);
    strcpy(fmt + sizeof(fmt) - 4, "..."); //truncation indicator
    isroot = true; //just suggest sudo on first message
    if (!strcmp(prevfmt, fmt)) //dup (probably); check includes line#, but *not* incl values
    {
        int now = time2msec();
//        static long int prev_outtime = time2msec();
//        const int rpt_grp = 1000; //only show every 1000th after first 10
//        bool show_rpt = (prev_outlen < -10)? !((-prev_outlen - 10) % rpt_grp): true;
//        bool show_dup = (prevout < 0)? (now + prevout > 1e3): true; //show dups 1x/sec
int sv_prevout = prevout;
        if ((prevout > 0) || (now + prevout > 1e3)) //show dups 1x/sec
        {
            fprintf(stderr, RED_MSG "." ENDCOLOR_NOLINE); //concise repeat indicator
            prevout = -now; //(prev_outlen > 0)? 0: prev_outlen - 1; //isdup = 1; //next non-dup msg will need to start with line break
        }
//        else fprintf(stderr, RED_MSG ".%'d" ENDCOLOR_NOLINE, now + prevout);
//NOTE: modifies prevout-        debug("prevout %d, now %'d, now + prevout %'d => prevout %'d, >=0? %d", sv_prevout, now, now + sv_prevout, prevout, prevout >= 0);
//        static int count = 0;
//        if (++count > 300) fatal("2");
        return(0); //cast to RETTYPE
    }
//    if (prev_outlen) isdup = 0;
    strcpy(prevfmt, fmt);
    va_list args;
    va_start (args, desc);
//        vsnprintf(previous, )
    prevout = vfprintf(stderr, fmt + (prevout > 0), args); //Vargs(desc).args);
    va_end(args);
//    isdup = 0;
//    if (RETTYPE == NegOne) return(-1); //caller wants error value
//    if (std::is_same<RETTYPE, NegOne>::value) return(-1); //caller wants error value
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

#if 0
//capture line# for err msg:
const char* errmsg_srcline;
//kludge: can't append SRCLINE to last arg due to C++ "<>" sybtax, so capture as var instead
//BROKEN- CAUTION: use "&" to join srcline capture to errmsg; "+" won't work if errmsg<> return type is "void*"
#define errmsg  (errmsg_srcline = SRCLINE, 0) + errmsg_ //(...)  _errmsg<>(__VA_ARGS__  SRCLINE) //append src location to last arg

//TODO
//void* operator+ (void* ptr, int ofs ) { return (char*)ptr + ofs; }

//in-line err msg:
//adds SDL or stdio error text to caller-supplied msg
template <long RETVAL = 0> // /*typename ... ARGS,*/ typename RETTYPE = long> //no- perfect forward to fprintf
/*RETTYPE*/ long errmsg_(const char* desc, ...) //ARGS&& ... args)
{
    static bool isroot = !geteuid(); //(getuid() == geteuid()); //0 == root
//TODO: getgrouplist() to check if member of video group?
    constexpr const char* try_sudo = ". Try \"sudo\"?"; //std::string try_sudo(" Try \"sudo\".");
    constexpr int msglen = strlen(try_sudo); //try_sudo.length
    const char* reason = errno? std::strerror(errno): nvl(SDL_GetError(), "(SDL error)");
    errno = 0; (void)SDL_ClearError(); //reset after reported
//#define SRCLINE  "  @" __FILE__ ":" TOSTR(__LINE__)
//#define ENDCOLOR_ATLINE  SRCLINE ENDCOLOR_NEWLINE
//    fprintf(stderr, RED_MSG "%s error: %s.%s" ENDCOLOR_ATLINE, desc, std::strerror(errno), &try_sudo[isroot? msglen: 0], std::forward<ARGS>(args) ...);
    char fmt[256]; //composite msg fmt string
//    static int isdup = 0;
    static char prevfmt[sizeof(fmt)] = {0};
    snprintf(fmt, sizeof(fmt), "\n" RED_MSG "%s error: %s%s%s" ENDCOLOR_NEWLINE, desc, reason, &try_sudo[isroot? msglen: 0], errmsg_srcline);
    strcpy(fmt + sizeof(fmt) - 4, "..."); //truncation indicator
    isroot = true; //just suggest sudo on first message
    if (!strcmp(prevfmt, fmt)) //dup (probably); check includes line#, but *not* incl values
    {
        auto now = time2msec();
//        static long int prev_outtime = time2msec();
//        const int rpt_grp = 1000; //only show every 1000th after first 10
//        bool show_rpt = (prev_outlen < -10)? !((-prev_outlen - 10) % rpt_grp): true;
//        bool show_dup = (prevout < 0)? (now + prevout > 1e3): true; //show dups 1x/sec
        if ((prevout > 0) || (now + prevout > 1e3)) //show dups 1x/sec
        {
            fprintf(stderr, RED_MSG "." ENDCOLOR_NOLINE); //concise repeat indicator
            prevout = -now; //(prev_outlen > 0)? 0: prev_outlen - 1; //isdup = 1; //next non-dup msg will need to start with line break
        }
        return(0); //cast to RETTYPE
    }
//    if (prev_outlen) isdup = 0;
    strcpy(prevfmt, fmt);
    va_list args;
    va_start (args, desc);
//        vsnprintf(previous, )
    prevout = vfprintf(stderr, fmt + (prevout > 0), args); //Vargs(desc).args);
    va_end(args);
//    isdup = 0;
//    if (RETTYPE == NegOne) return(-1); //caller wants error value
//    if (std::is_same<RETTYPE, NegOne>::value) return(-1); //caller wants error value
    return(RETVAL); //0); //cast to RETTYPE
}
//#if 0
//kludge class to convert ret(0) to special value (-1, MAP_FAILED, etc):
template <int RETVAL = 0>
struct RetVal
{
    template <typename ... ARGS> //accept any args
    RetVal(ARGS&& ... args) {}
    operator long() { return (long)RETVAL; } //use "long" to prevent loss of precision on ptr
};
//#if 0
struct NegOne
{
    NegOne(int) {}
    operator int() { return -1; }
};
//kludge class to convert ret(0) to ret(MAP_FAILED):
//can't use void* within arith expr, so use this instead
struct MapFailed
{
    MapFailed(int) {}
    operator int() { return (int)MAP_FAILED; }
};
#endif


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
//#include <SDL.h>

//SDL retval conventions:
//0 == Success, < 0 == error, > 0 == data ptr (sometimes)
//#define SDL_OK  0
//#define SDL_Success  0
//#define SDL_OtherError  -2 //arbitrary; anything < 0
//int SDL_LastError = SDL_Success; //remember last error (mainly for debug msgs)
//use overloaded function to handle different SDL retval types:
#define SDL_OK(retval)  ((retval) >= 0) //((SDL_LastError = (retval)) >= 0)
//inline bool SDL_OK(int errcode) { return ((SDL_LastError = errcode) >= 0); }


//#if !defined(NODEJS_ADDON) && !defined(HAS_SDL)
// #pragma message(CYAN_MSG "assuming libSDL2 is installed" ENDCOLOR_NOLINE)
// #define HAS_SDL
//#endif
//#ifdef HAS_SDL //SDL_INIT_VIDEO //SDL installed, XWindows *not* necessarily running
// #pragma message(CYAN_MSG "compiled for SDL" ENDCOLOR_NOLINE)

#if 0 //BROKEN; SDL trace
//use perfect forwarding to trace SDL API calls
//don't care about these:
//SDL_Init
//SDL_SetHint
//SDL_GetNumVideoDisplays
//SDL_GetNumDisplayModes
//SDL_GetCurrentDisplayMode
//SDL_BITSPERPIXEL
//SDL_GetPixelFormatName
//SDL_GetError
//SDL_GetDisplayBounds
//SDL_CreateWindow
//SDL_CreateRenderer
//SDL_PollEvent
//SDL_DestroyTexture
//SDL_DestroyRenderer
//SDL_DestroyWindow
//SDL_Quit
//SDL_GetPerformanceCounter
//SDL_GetPerformanceFrequency
#define tracer(name)  \
template <typename ... ARGS>  \
/*TODO? lambda? auto tracer_ ## __LINE__ = [](ARGS&& ... args) -> decltype(name()) */  \
decltype(name()) tracer_ ## name(ARGS&& ... args)  \
{  \
    debug("TRACE: " #name);  \
    return name(std::forward<ARGS>(args) ...);  \
}
tracer(SDL_CreateWindowAndRenderer)
#define SDL_CreateWindowAndRenderer  tracer_SDL_CreateWindowAndRenderer
tracer(SDL_SetRenderDrawColor)
#define SDL_SetRenderDrawColor  tracer_SDL_SetRenderDrawColor
tracer(SDL_RenderClear)
#define SDL_RenderClear  tracer_SDL_RenderClear
tracer(SDL_SetRenderDrawColor)
#define SDL_RenderPresent  tracer_SDL_SetRenderDrawColor
tracer(SDL_CreateTexture)
#define SDL_CreateTexture  tracer_SDL_CreateTexture
tracer(SDL_UpdateTexture)
#define SDL_UpdateTexture  tracer_SDL_UpdateTexture
tracer(SDL_RenderClear)
#define SDL_RenderClear  tracer_SDL_RenderClear
tracer(SDL_RenderCopy)
#define SDL_RenderCopy  tracer_SDL_RenderCopy
tracer(SDL_RenderPresent)
#ifdef SDL_RenderPresent
 #undef SDL_RenderPresent
#endif
#define SDL_RenderPresent  tracer_SDL_RenderPresent
#endif


//FB low-level I/O:
//2 scenarios:
//- if XWindows is running, emulate FB using SDL window
//- if running in console, use FB/stdio
#define LAZY_TEXTURE //don't create until caller uses pixels
class FBIO
{
//check for XWindows, DEFER TO Std FB functions:
//FB not working with XWindows (also tried xorg FB driver) :(
    /*static*/ const bool broken_isXWindows = (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
    /*static*/ const /*bool*/int isXWindows = (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
public: //ctors/dtors
    FBIO(): sdl_window(sdl_window), sdl_mode(sdl_mode), sdl_renderer(sdl_renderer), sdl_texture(sdl_texture), m_pixels(m_pixels)
    {
//        if (!get_disp_mode()) return; //kludge: re-get disp mode due to init order problem; fb_open was called before FBIO ctor ??
        debug("FBIO ctor %'d x %'d, wnd %p, rend %p, txtr %p, px %p", sdl_mode.w, sdl_mode.h, sdl_window, sdl_renderer, sdl_texture, m_pixels); //, &sdl_mode);
    }
#if 1
protected: //SDL not working with FB, so emulate it here  :(
    SDL_Window* sdl_window; //= 0;
    SDL_DisplayMode sdl_mode; //= {0}; //CAUTION: do not re-init after calling FB delegated ctor
//kludge: use static data to preserve around init order problem
//    SDL_DisplayMode& sdl_mode = kludgey_pre_init(); //= {0}; //CAUTION: do not re-init after calling FB delegated ctor
//    static SDL_DisplayMode& kludgey_pre_init() //kludge: use static wrapper to embed within class, init before class methods called
//    {
//        static SDL_DisplayMode dispmode = {0};
//        debug("SDL_DisplayMode @%p bypass init! %'d x %'d", &dispmode, dispmode.w, dispmode.h);
//        return dispmode;
//    }
    SDL_Renderer* sdl_renderer; //= 0;
    SDL_Texture* sdl_texture; //= 0;
    uint32_t* m_pixels; //= 0;
    template <typename ... ARGS>
    int fb_open(ARGS&& ... args)
    {
debug("fb_open");
//        memset(&sdl_mode, 0, sizeof(sdl_mode)); //must be init before calling delegated ctor
//        for (int i = 0; i < sizeof(sdl_mode); ++i)
//            if (((uint8_t*)&sdl_mode)[i]) errmsg("sdl_mode !init");
        debug("fb_open: XWindows? 0x%x 0x%x, Disp '%s', 0x%x 0x%x, %lu %lu", (int)isXWindows, (int)broken_isXWindows, nvl(getenv("DISPLAY"), "(none)"), !(int)isXWindows, !(int)broken_isXWindows, sizeof(isXWindows), sizeof(broken_isXWindows));
        if (!isXWindows) return open(std::forward<ARGS>(args) ...); //perfect forward
        debug("!try sdl? 0x%x", !isXWindows);
        SDL_Init(SDL_INIT_VIDEO);
        SDL_SetHint(SDL_HINT_RENDER_VSYNC, "1"); //use video sync to avoid tear
        int dispinx = 0; //default first screen
        sscanf(nvl(getenv("DISPLAY"), ":0"), ":%d", &dispinx); //) dispinx = 0; //default first screen
//        static int once = 0;
//        if (!once++)
        {
            debug("#disp: %d, #modes: %d", SDL_GetNumVideoDisplays(), SDL_GetNumDisplayModes(dispinx));
            for (int i = 0, limit = SDL_GetNumVideoDrivers(); i < limit; ++i)
                debug("video driver[%d/%d]: '%s'", i, limit, SDL_GetVideoDriver(i));
            SDL_Rect r = {0};
            if (!SDL_OK(SDL_GetDisplayBounds(0, &r))) return errmsg("SDL_GetDisplayBounds");
            debug("disp rect: (%'d, %'d), (%'d, %'d)", r.x, r.y, r.w, r.h);
        }
//        SDL_DisplayMode mode;
        if (!SDL_OK(SDL_GetCurrentDisplayMode(dispinx, &sdl_mode))) return errmsg("SDL_GetDisplayMode [%d]", dispinx);
        debug("cur disp mode: %d bpp, %s %'d x %'d", SDL_BITSPERPIXEL(sdl_mode.format), SDL_GetPixelFormatName(sdl_mode.format), sdl_mode.w, sdl_mode.h); //should match "tvservice -s"
//NOTE: will cre full screen if !XWindows (W + H ignored)
        const int X = isXWindows? sdl_mode.w / 10: SDL_WINDOWPOS_UNDEFINED, Y = isXWindows? sdl_mode.h / 10: SDL_WINDOWPOS_UNDEFINED;
        const int W = isXWindows? sdl_mode.w / 2: 640, H = isXWindows? sdl_mode.h / 2: 480;
        const int flags = SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC;
//        sdl_window = SDL_CreateWindow("SDL2 Pixel Drawing", X, Y, W, H, 0);
//        if (!sdl_window) return errmsg("SDL_CreateWindow");
//        sdl_renderer = SDL_CreateRenderer(sdl_window, -1, flags); //0);
//        if (!sdl_renderer) return errmsg("SDL_CreateRenderer");
        if (!SDL_OK(SDL_CreateWindowAndRenderer(W, H, flags, &sdl_window, &sdl_renderer))) return errmsg("SDL_CreateWindowAndRenderer");
        sdl_mode.w = W; sdl_mode.h = H; //requested size
//errmsg(PINK_MSG "SDL_CreateWindowAndRenderer");
//SDL_RendererInfo rinfo;
//if (!SDL_OK(SDL_GetRendererInfo(sdl_renderer, &rinfo))) return errmsg("SDL_GetRendererInfo %p", sdl_renderer);
//debug("renderer %p: '%s', flag 0x%x, #fmts %d, maxw %'d, maxh %'d", sdl_renderer, rinfo.name, rinfo.flags, rinfo.num_texture_formats, rinfo.max_texture_width, rinfo.max_texture_height);
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
        fb_fill(::RED); sleep(3);
        fb_fill(::GREEN); sleep(3);
        fb_fill(::BLUE); sleep(3);
        fb_fill(::YELLOW); sleep(3);
        fb_fill(::CYAN); sleep(3);
        fb_fill(::MAGENTA); sleep(3);
        fb_fill(0xFF008080); sleep(3);
        fb_fill(::BLACK);
debug("fb_open OK: %'d x %'d, wnd %p, rend %p, txtr %p, px %p", sdl_mode.w, sdl_mode.h, sdl_window, sdl_renderer, sdl_texture, m_pixels); //, &sdl_mode);
        return 1234; //fake fd (success)
    }
//fill direct to texture (no pixels):
    int fb_fill(uint32_t ext_color)
    {
//        constexpr uint32_t color = 0xFF800080; //BLACK;
debug("fill window with 0x%x = r x%x, g x%x, b x%x, a x%x", ext_color, R_G_B_A(ext_color));
        if (!sdl_renderer) return errmsg("no renderer");
        if (!SDL_OK(SDL_SetRenderDrawColor(sdl_renderer, R_G_B_A(ext_color)))) return errmsg("SDL_SetRenderDrawColor");
        if (!SDL_OK(SDL_RenderClear(sdl_renderer))) return errmsg("SDL_RenderClear");
////        SDL_SetRenderDrawColor(renderer, 255, 0, 0, 255);
        (void)SDL_RenderPresent(sdl_renderer); //repaint screen; waits for VSYNC
        return 1; //success
    }
    int fb_close(int fd)
    {
        if (!isXWindows) return close(fd);
#ifndef LAZY_TEXTURE
        if (sdl_texture) SDL_DestroyTexture(sdl_texture); sdl_texture = 0;
#endif //ndef LAZY_TEXTURE
        if (sdl_renderer) SDL_DestroyRenderer(sdl_renderer); sdl_renderer = 0;
        if (sdl_window) SDL_DestroyWindow(sdl_window); sdl_window = 0;
        SDL_Quit();
        return 0; //success
    }
    int fb_ioctl(int fd, int cmd, void* data)
    {
        if (!isXWindows) return ioctl(fd, cmd, data);
//        static int count = 0;
//        if (count++ < 5) debug("fake ioctl(cmd 0x%x)", cmd);
        switch (cmd)
        {
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
                if (sdl_texture) //TODO: add dirty flag setters?
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
//                dirty = false;
                }
//if (count < 10) errmsg(PINK_MSG "SDL_RenderPresent");
                (void)SDL_RenderPresent(sdl_renderer); //waits for VSYNC
//                lastTime = //SDL_GetTicks();
//                    SDL_GetPerformanceCounter() / SDL_GetPerformanceFrequency();
                return 0; //success
            }
//            default:
//                errmsg("unknown ioctl cmd: 0x%x (wanted 0x%x, 0x%x, or 0x%x)", cmd, FBIOGET_VSCREENINFO, FBIOGET_FSCREENINFO, FBIO_WAITFORVSYNC);
//                return -1;
        }
        return errmsg(-1, "unknown ioctl cmd: 0x%x (wanted 0x%x, 0x%x, or 0x%x)", cmd, FBIOGET_VSCREENINFO, FBIOGET_FSCREENINFO, FBIO_WAITFORVSYNC);
//        return -1; //error
    }
    void* fb_mmap(void* addr, size_t len, int prot, int flags, int fd, int ofs)
    {
//        using rettype = uint8_t*; //void*; //needs size
        if (!isXWindows) return mmap(addr, len, prot, flags, fd, ofs);
        size_t numpx = sdl_mode.h * sdl_mode.w; // * sizeof(m_pixels[0]);
        if (prot != (PROT_READ | PROT_WRITE)) return errmsg(MAP_FAILED, "unknown mmap prot: 0x%x (wanted 0x%x)", prot, PROT_READ | PROT_WRITE);
        if (flags != MAP_SHARED) return errmsg(MAP_FAILED, "unknown flags: 0x%x (wanted 0x%x)", flags, MAP_SHARED);
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
        return m_pixels;
    }
    int fb_munmap(void* addr, size_t len)
    {
        if (!isXWindows) return munmap(addr, len);
        if (m_pixels) delete[] m_pixels; m_pixels = 0;
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
#endif
#if 0
 #include <X11/Xlib.h>
// #include <X11/Xatom.h>
// #include <X11/Xutil.h>
 #include <X11/extensions/xf86vmode.h> //XF86VidModeGetModeLine
 #include <memory> //std::unique_ptr<>
 #define XDisplay  Display //avoid confusion
// #define XColormap  Colormap
 #define XWindow  Window //avoid confusion
 #define XScreen  Screen //avoid confusion
// #define IFXWIN_1ARG(stmt)  stmt
// #define IFXWIN_2ARGS(yes_stmt, no_stmt)  yes_stmt
 #ifdef SIZEOF
  #undef SIZEOF //avoid conflict with xf86 def
 #endif

 //fall-back logic to get pixel clock (XWindows only):
 int getXPixelClock()
 {
//#ifdef RPI_NO_X
//            exc_soft("TODO: vcgencmd measure_clock pixel");
//#else //query video info from X Windows
    std::unique_ptr<XDisplay, std::function<void(XDisplay*)>> display(/*XOpenDisplay(NULL)*/NULL, XCloseDisplay));
    display.set(XOpenDisplay(getenv("DISPLAY")); //NULL));
    int num_screens = display.get()? ScreenCount(display.get()/*.cast*/): 0;
    Screen scr = num_screens? DefaultScreen(display.get()): -1;
    debug("X fall-back (!RPi): got disp %p, #screens: %d, default = %d", display.get(), num_screens, scr);
//            GC gc = NULL;
    for (int s = 0; s < num_screens; ++s)
    {
        if (s != DefaultScreen(display.get())) continue; //just use default
        int dot_clock; //, mode_flags;
//        XF86VidModeModeLine mode_line = {0};
//        XScreen screen = ScreenOfDisplay(display.cast, i);
//see https://ubuntuforums.org/archive/index.php/t-779038.html
//xvidtune-show
//"1366x768"     69.30   1366 1414 1446 1480        768  770  775  780         -hsync -vsync
//             pxclk MHz                h_field_len                v_field_len    
        XF86VidModeModeLine mode_line;
        if (!XF86VidModeGetModeLine(display.get()/*.cast*/, s, &dot_clock, &mode_line)) continue; //&mode_line)); //continue; //return FALSE;
//                debug(0, "X dot clock %d", dot_clock);
        return 1e9 / dot_clock; //KHz => psec
    }
    return 0;
 }
//#elif defined(RPI_NO_X)
//// #include "bcm_host.h"
// #define IFXWIN_1ARG(stmt)  //nop
// #define IFXWIN_2ARGS(yes_stmt, no_stmt)  no_stmt
//#elif false //true
//sudo apt-get install libx11-xcb-dev
//XCB info:
// https://www.x.org/releases/current/doc/libxcb/tutorial/index.html
// https://xcb.freedesktop.org/tutorial/basicwindowsanddrawing/
// https://stackoverflow.com/questions/27745131/how-to-use-shm-pixmap-with-xcb?noredirect=1&lq=1
// https://github.com/enn/xcb-examples
//#else //stdio to access real FB
// #pragma message(CYAN_MSG "compiled for bare FB" ENDCOLOR_NOLINE)
//#endif
#endif
};


//FB open/close wrapper:
//auto-close when done
class FB: public FBIO //: public fb_screeninfo
{
    using fd_t = int;
    using time_t = decltype(time2msec()); //long int;
    const fd_t m_fd = 0;
//    using m_fd_nocvref = std::remove_cvref<decltype(m_fd)>::type;
    const time_t m_started = now();
//protected:
//public:
//    FBIO fbio; //CAUTION: must be init before any method calls; can't use as base class
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
debug("fb fd %d, started %'d, elapsed %'d", fd, m_started, elapsed());
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
    explicit operator fd_t() const { return(m_fd); } //debug("int fd %d", m_fd); return(m_fd); }
//    explicit operator const decltype(m_info)* () { return screeninfo(); }
public: //getters/setters
    static time_t now() { return(time2msec()); }
    time_t elapsed() const { return(now() - m_started); } //debug("elapsed: %'d - %'d = %'d", now(), m_started, now() - m_started);
    void elapsed(time_t new_elapsed)
    {
        time_t old_elapsed = elapsed();
        *(time_t*)&m_started += old_elapsed - new_elapsed; //bypass "const"
//reset frame count as well; preserve frame rate:
        sync_good = old_elapsed? new_elapsed * sync_good / old_elapsed: 0;
        sync_errs = old_elapsed? new_elapsed * sync_errs / old_elapsed: 0;
    }
public: //methods
    bool isOpen() const { return(isOpen(m_fd)); }
    static bool isOpen(fd_t fd) { return(fd && (fd != -1)); }
    const auto /*decltype(m_info)**/ screeninfo() const { return(&m_info); }
//wait for video sync:
//allows very simple timing control; GPU controls caller's frame update rate
    int sync_good = 0, sync_errs = 0; //won't ever wrap @60 fps
    int numfr() const { return(sync_good + sync_errs); }
    double fps() const { time_t elaps = elapsed(); return(elaps? 1e3 * numfr() / elaps: 0); } //actual
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
            if (fb_ioctl(m_fd, FBIO_WAITFORVSYNC, &arg) >= 0) return(++sync_good); //true
            ++sync_errs; //only count errors if open
        }
        /*if (delay_on_error)*/ usleep(frtime() * 1e3); //wait 1/60 sec to maintain caller timing
        return(false); //error or !open
    }
    bool wait_sec(int sec) { return wait_msec(sec * 1e3); }
//TODO? wait_until(time_t elapsed)
    bool wait_msec(int msec)
    {
        const time_t wakeup = now() + msec; //TODO: use last sync timestamp?
        bool retval = true;
        for (;;)
        {
            retval = wait4sync() && retval; //wait at least 1 frame
//            int remaining = wakeup - now();
//            if (!ok) if (remaining > 0) usleep(remaining * 1e3);
//debug("now %'d, wkup %'d, ret? %d", now(), wakeup, now() >= wakeup);
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
//BROKEN perfect forwarding to I/O layer:
//kludge to force FBIO init < first func called
//PERF_FWD(fb_open, fb_open);
//PERF_FWD(fb_mmap, fb_mmap);
//PERF_FWD(fb_ioctl, fb_ioctl);
//PERF_FWD(fb_munmap, fb_mummap);
//PERF_FWD(fb_close, fb_close);
};


//memory-mapped FB pixels:
//auto-close (unmap) when done
template</*int BPP = 4,*/ bool BOUNDS_CHECK = true>
class FBPixels: public FB
{
public: //typedefs
    using data_t = color_t; //argb_t; //uint32_t; //vs rgb888_t, rgb565_t
    using size_t = unsigned int; //unsigned long int; //CAUTION: needs to be unsigned for simpler bounds checking
private:
//    int m_bpp;
    data_t* const m_px;
    data_t m_dummy; //1 dummy pixel for out-of-bounds l-value/ref
    const size_t m_rowlen32, m_height; //CAUTION: horizontal raster lines might be padded, so store effective width
    const size_t m_numpx; //slightly WET to reduce run-time bounds checking :(
public: //ctors/dtors
    template <typename ... ARGS> //perfect forward to parent ctor
    explicit FBPixels(ARGS&& ... args): m_dummy(0), FB(std::forward<ARGS>(args) ...), m_px(0), m_rowlen32(0), m_height(0), m_numpx(0)
    {
        debug("FBPixels ctor");
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
        *(size_t*)&m_height = screeninfo()->var.yres;
        *(size_t*)&m_rowlen32 = screeninfo()->fix.line_length / 4; //effective width after padding
        if (m_rowlen32 != screeninfo()->var.xres) debug(YELLOW_MSG "CAUTION: raster rowlen32 %'d != width %'d", m_rowlen32, screeninfo()->var.xres);
        if (m_height * m_rowlen32 * 4 != screeninfo()->fix.smem_len) debug(YELLOW_MSG "CAUTION: raster size %'d != calc %'d", m_height * m_rowlen32 * 4, screeninfo()->fix.smem_len);
        *(data_t**)&m_px = (data_t*)fb_mmap(0, m_height * m_rowlen32 * 4, PROT_READ | PROT_WRITE, MAP_SHARED, (int)*this, 0); //shared with GPU
        if (m_px == (data_t*)MAP_FAILED) RETURN(errmsg("px mmap"));
        *(size_t*)&m_numpx = m_height * m_rowlen32; //only set size if mmap successful; NOTE: might be larger than screen hres due to padding
debug("mmap@ %p, bpp %d, size %'d (info says %'d), rowlen32(w) %'d, h %'d, #px %'d", m_px, bpp(),  m_height * m_rowlen32 * 4, scrinfo->fix.smem_len, m_rowlen32, m_height, m_numpx);
//no; leave contents intact        memset(m_px, 0, m_numpx * BPP()); //start all transparent black
    }
    ~FBPixels() { if (m_numpx && (fb_munmap((data_t*)m_px, m_numpx * 4) == -1)) errmsg("px munmap"); }
    FBPixels(const FBPixels& that) { *this = that; } //avoid [-Weffc++] warning
public: //operators
    FBPixels& operator=(const FBPixels& that) { *this = that; } //[-Weffc++]
public: //getters/setters
    size_t width() const { return(m_rowlen32); } //screeninfo()->var.xres); }
    size_t height() const { return(m_height); } //screeninfo()->var.yres); }
    auto bpp() const { return(screeninfo()->var.bits_per_pixel); } //bits
    auto BPP() const { return(screeninfo()->var.bits_per_pixel / 8); } //bytes
//public: //methods
//NOTE: compiler should be smart enough to optimize out unneeded checks:
//(x, y) access to pixels:
    bool inbounds(size_t x, size_t y) const { return(!BOUNDS_CHECK || ((x < m_rowlen32) && (y < m_height))); }
    size_t xyofs(size_t x, size_t y) const { return(inbounds(x, y)? y * m_rowlen32 + x: -1); } //CAUTION: invalid index should also fail bound check
    data_t& pixel(size_t x, size_t y) { return(pixel(xyofs(x, y))); } //rd/wr
    const data_t& pixel(size_t x, size_t y) const { return(pixel(xyofs(x, y))); } //rd-only
//linear/array access to pixels:
//CAUTION: caller must observe padding
    bool inbounds(size_t ofs) const { return(BOUNDS_CHECK? (ofs < m_numpx): m_numpx); }
    data_t& pixel(size_t ofs) { return(inbounds(ofs)? m_px[ofs]: m_dummy); } //rd/wr
    const data_t& pixel(size_t ofs) const { return(inbounds(ofs)? m_px[ofs]: 0); } //rd-only
    data_t* pixels(size_t numpx) /*const*/ { return(inbounds(numpx - 1)? m_numpx: 0); }
    void fill() { fill(::BLACK); }
//    void fill(constexpr uint32_t argb) { fill(_t color(argb); debug("fill %'d px with 0x%x", m_numpx, color.m_color); for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color.m_color; }
//    void fill(constexpr uint32_t argb) { argb_t color(argb); debug("fill %'d px with 0x%x", m_numpx, color.m_color); for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color.m_color; }
    void fill(uint32_t argb)
    {
        color_t color(argb);
//        debug("fill %'d px with 0x%x", m_numpx, color.m_color);
        for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color.m_color;
    }
    void row(size_t y, uint32_t argb)
    {
        color_t color(argb);
//        debug("fill %'d px with 0x%x", m_numpx, color.m_color);
        for (size_t i = xyofs(0, y), limit = xyofs(0, y + 1); i < limit; ++i) m_px[i] = color.m_color;
    }
    void col(size_t x, uint32_t argb)
    {
        color_t color(argb);
//        debug("fill %'d px with 0x%x", m_numpx, color.m_color);
        for (size_t i = xyofs(x, 0); i < m_numpx; i += m_rowlen32) m_px[i] = color.m_color;
    }
};


//24-bit pivot:
//rotates 24 independent channels of pixels into 24-bit parallel output values
//RPi GPU is not fast enough for 24 memory accesses per pixel, so make CPU do it :(
//for WS281X, adds bit start + stop into data stream
//for YALP, also adds frame# and checksum into data stream
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
/// CLI:
//

#ifndef NODEJS_ADDON
#pragma message(CYAN_MSG "compiled for stand-alone usage (no Node.js addon)" ENDCOLOR_NOLINE)

#include <cstdio> //fileno()
#include <unistd.h> //isatty()


//WS281X test using Linux framebuffer:
//https://www.kernel.org/doc/Documentation/fb/api.txt
int main(int argc, char* argv[])
{
//    setlocale(LC_ALL, ""); //enable %'d commas in printf
    const bool noGUI = isatty(fileno(stdin)); //https://stackoverflow.com/questions/13204177/how-to-find-out-if-running-from-terminal-or-gui
    const bool isXWindows = !!getenv("DISPLAY");
    const bool isXTerm = !!getenv("TERM");
    const bool isSSH = !!getenv("SSH_CLIENT");
    debug("running in X-Windows? %d, has gui? %d, xterm? %d, ssh? %d", isXWindows, !noGUI, isXTerm, isSSH);

debug("external: red 0x%x, green 0x%x, blue 0x%x", ::RED, ::GREEN, ::BLUE);
debug("internal: red 0x%x, green 0x%x, blue 0x%x", color_t::RED.m_color, color_t::GREEN.m_color, color_t::BLUE.m_color); //color_t(RED).m_color, color_t(GREEN).m_color, color_t(BLUE).m_color);
//return 0;
//    for (int i = 0; i < 10; ++i)
//    {
//        debug("time[%d] %'d", i, time2msec());
//        sleep(1);
//    }
//    exit(1);

    FBPixels<> fb; //("/dev/fb1");
    if (!fb.isOpen()) return(1);
    const int width = fb.width(), height = fb.height();
//    printf("The framebuffer device opened.\n");
//        auto scrinfo = fb.screeninfo();
//        if (scrinfo) printf("Display info: %'d x %'d (%'d px), aspect %3.2f, %d bpp\n", scrinfo->var.xres, scrinfo->var.yres, scrinfo->var.xres * scrinfo->var.yres, (double)scrinfo->var.xres / scrinfo->var.yres, scrinfo->var.bits_per_pixel );
    debug(CYAN_MSG "Display info: %'d x %'d (%'d px), aspect %3.2f, %d bpp", width, height, width * height, (double)width / height, fb.bpp());

//test frame rate:
//        sleep(3);
    debug("frame rate test 10 sec ...");
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
    debug(CYAN_MSG "%'d frames, %4.3f sec = %3.2f fps", fb.numfr(), fb.elapsed() / 1e3, fb.fps());

//screen tests:
    struct { const char* name; uint32_t value; }
    colors[] =
    {
        {"red", ::RED}, {"green", ::GREEN}, {"blue", ::BLUE},
        {"yellow", ::YELLOW}, {"cyan", ::CYAN}, {"magenta", ::MAGENTA},
        {"white", ::WHITE}, {"warm white", ::WARM_WHITE}, {"cool white", ::COOL_WHITE},
        {"black", ::BLACK}
    };
    debug("fill test %lu x 3 sec ...", SIZEOF(colors));
//        fb.fill(::WHITE_low);
//        sleep(3);
    for (auto cp = &colors[0]; cp < &colors[SIZEOF(colors)]; ++cp)
    {
        fb.wait_sec(3);
        debug("%s 0x%x", cp->name, cp->value);
        fb.fill(cp->value);
    }

    fb.wait_sec(3);
    debug("row test ...");
    fb.elapsed(0); //reset stopwatch
    const color_t color = ::GREEN; //_low; //(0xFF, 0, 0x80, 0x80); //dim red
//        const int w = 10, h = 10;
    for (int y = 0; y < height; ++y)
    {
        for (int x = 0; x < width; ++x)
            fb.pixel(x, y) = color; //.fromARGB(0xff, 0x00, 0x80, 0x80);
//            /*if (!(fr % 60))*/ debug("%'d frames", y);
        fb.wait4sync(); //row-by-row fill
    }
//printf("here2\n");
    debug(CYAN_MSG "%'d rows (%'d frames) 0x%x, %4.3f sec = %3.2f fps", height, fb.numfr(), color.m_color, fb.elapsed() / 1e3, fb.fps());

//row/col test:
    fb.wait_sec(3);
    debug("grid test %'d sec ...", width + height);
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
    debug(CYAN_MSG "%'d rows + %'d cols = %'d frames, %4.3f sec = %3.2f fps", height / 100, width / 100, fb.numfr(), fb.elapsed() / 1e3, fb.fps());
    fb.wait_sec(5);
    return(0);
}
#endif //ndef NODEJS_ADDON

//eof