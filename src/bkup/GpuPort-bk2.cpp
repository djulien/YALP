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
//audio deps:
//  sudo apt install  libao4 libao-dev  libmpg123-0 libmpg123-dev
//
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
#include <cstring> //strerror(), strcmp()
#include <cerrno> //errno, strerror()
#include <memory> //memset(), //std::shared_ptr<>
//#include <type_traits> //std::remove_cvref<>, std::decay<>, std::remove_reference<>, std::remove_pointer<>, std::conditional<>, std::if_same<>, std::is_arithmetic<>, enable_if<>, is_same<>, const_cast<>, result_of<>, std::is_function<>
#include <cstdint> //uint32_t etc
#include <clocale> //setlocale()
#include <stdexcept> //std::out_of_range()
#include <utility> //std::as_const(), std::pair<>
#include <stdio.h> //printf(), fopen(), fclose()
//#include <string.h> //snprintf()
//#include <ctype.h> //isxdigit()
//#include <sys/stat.h> //struct stat
#include <cstdint> //uint32_t
#include <sstream> //std::ostringstream
//#include <memory.h> //memmove()
#include <algorithm> //std::min<>(), std::max<>()
#include <stdarg.h> //va_list, va_start(), va_end()
#include <numeric> //std:lcm()
#include <vector> //std::vector<>

//select low-level api:
#define WANT_FB //use FB interface (higher pixel counts, more CPU load)
//#define WANT_OGL //use OpenGLES (more GPU load, less CPU load, more flexible hres)
//include audio:
#define WANT_AUDIO


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

#include "macro-vargs.h"

//compile-time length of array:
#define SIZEOF(thing)  (sizeof(thing) / sizeof((thing)[0]))

//dummy keywords:
//should use "static" or "void" but compiler doesn't like it
#define STATIC  //static
#define VOID  //void

//left/right shift:
#define shiftlr(val, pos)  (((pos) < 0)? ((val) << -(pos)): ((val) >> (pos)))

//divide up:
#define divup(num, den)  (((num) + (den) - 1) / (den))
//rounded divide:
#define rdiv(num, den)  (((num) + (den) / 2) / (den))
//make value a multiple of another:
//#define multiple(num, den)  ((num) - (num) % (den))

//min/max:
//use this when std::min is too strict with types:
#define MIN(...)  UPTO_4ARGS(__VA_ARGS__, MIN_4ARGS, MIN_3ARGS, MIN_2ARGS, missing_arg) (__VA_ARGS__)
#define MIN_2ARGS(lhs, rhs)  (((lhs) < (rhs))? (lhs): (rhs))
#define MIN_3ARGS(lhs, mhs, rhs)  MIN_2ARGS(lhs, MIN_2ARGS(mhs, rhs))
#define MIN_4ARGS(llhs, rlhs, lrhs, rrhs)  MIN_2ARGS(MIN_2ARGS(llhs, rlhs), MIN_2ARGS(lrhs, rrhs))
#define MAX(...)  UPTO_4ARGS(__VA_ARGS__, MAX_4ARGS, MAX_3ARGS, MAX_2ARGS, missing_arg) (__VA_ARGS__)
#define MAX_2ARGS(lhs, rhs)  (((lhs) > (rhs))? (lhs): (rhs))
#define MAX_3ARGS(lhs, mhs, rhs)  MAX_2ARGS(lhs, MAX_2ARGS(mhs, rhs))
#define MAX_4ARGS(llhs, rlhs, lrhs, rrhs)  MAX_2ARGS(MAX_2ARGS(llhs, rlhs), MAX_2ARGS(lrhs, rrhs))


//no worky :(
//static double operator%(double lhs, const int rhs)
//{
//    return lhs - rhs * (int)(lhs / rhs);
//}
#define mod(num, den)  ((num) - (den) * (int)((num) / (den)))


//end of string buf:
//CAUTION: points past last char
#ifndef strend
 #define strend(buf)  ((buf) + sizeof(buf))
#endif

//use in place of "this" when no instance needed
//use for decltype, which does not execute but needs an instance for context
#ifndef NULL_OF
 #define NULL_OF(cls)  ((cls*)0)
#endif

//kludge: compiler doesn't like "return (void)expr" so fake it
#define RETURN(...) { __VA_ARGS__; return; }

//#define errmsg(msg, ...)  fprintf(stderr, RED_MSG msg ENDCOLOR_ATLINE, __VA_ARGS__)
//#define warn(msg, ...)  fprintf(stderr, YELLOW_MSG msg ENDCOLOR_ATLINE, __VA_ARGS__)
#define SRCLINE  "  @" __FILE__ ":" TOSTR(__LINE__)
//#define ATLINE(...)  __VA_ARGS__  SRCLINE //append src line# to last arg


//convert to string + force inner macro expansion:
#ifndef TOSTR
// #define TOSTR(str)  CONCAT(#str)
 #define TOSTR(str)  TOSTR_NESTED(str)
 #define TOSTR_NESTED(str)  #str //kludge: need nested level to force expansion
#endif

//non-string version of above:
//#ifndef EVAL
// #define EVAL(thing)  EVAL_NESTED(thing)
// #define EVAL_NESTED(thing)  thing //kludge: need nested level to force expansion
//#endif


//kludge: "!this" no worky with g++ on RPi??
//#ifndef isnull
// #ifdef __ARMEL__ //RPi //__arm__
//  #define isnull(ptr)  ((ptr) < reinterpret_cast<decltype(ptr)>(2)) //kludge: "!this" no worky with g++ on RPi; this !< 1 and != 0, but is < 2 so use that
// #else //PC
//  #define isnull(ptr)  !(ptr)
// #endif
//#endif


//define a const symbol:
//doesn't use any run-time storage space
#define CONSTDEF(...)  UPTO_4ARGS(__VA_ARGS__, CONSTDEF_4ARGS, CONSTDEF_3ARGS, CONSTDEF_2ARGS, missing_arg) (__VA_ARGS__)
#define CONSTDEF_2ARGS(name, item)  CONSTDEF_3ARGS(name, item, 0)
#define CONSTDEF_3ARGS(name, item, value)  \
struct name { enum { item = value }; }
//kludge: split name into 2 args to allow it to contain "," (for templated names)
#define CONSTDEF_4ARGS(name1, name2, item, value)  \
struct name1, name2 { enum { item = value }; }


//reduce verbosity:
//TODO: find out why second std::vector<> arg is sometimes not needed
//template<typename T>
//class std_vector: public std::vector<T, std::allocator<T>> {};
////template<typename T>
////class clsprop: public Napi::ClassPropertyDescriptor<T> {};
////#define napi_clsprop  Napi::ClassPropertyDescriptor


//perfect forwarding:
#define PERFWD(from, to)  \
template <typename ... ARGS>  \
inline /*auto*/ decltype(to(std::forward<ARGS>(args) ...)) from(ARGS&& ... args) { return to(std::forward<ARGS>(args) ...); }

#define PERFWD_CTOR(from, to)  \
template <typename ... ARGS>  \
from(ARGS&& ... args): to(std::forward<ARGS>(args) ...)


#define warn(...)  debug(YELLOW_MSG "WARNING: " __VA_ARGS__)

//debug helpers:
//#define debug(msg)  printf(BLUE_MSG msg ENDCOLOR_ATLINE)
//TODO: use FIRST() and OTHERS() to peel off first arg
//TODO: convert to custom function? (color spread)
static int prevout = true; //don't need to start with newline
class DebugScope
{
    static std::vector<const char*> debug_labels;
public: //ctor/dtor
    DebugScope(const char* name) { debug_labels.push_back(name); }
    ~DebugScope() { debug_labels.pop_back(); }
public: //methods
    static const char* top(const char* suffix)
    {
        static std::string buf;
        if (!debug_labels.size()) return "";
        buf = debug_labels.back(); //[debug_labels.size() - 1];
        if (suffix) buf += suffix;
        return buf.c_str();
    }
};
STATIC decltype(DebugScope::debug_labels) DebugScope::debug_labels;

const char* rti(void); //fwd ref
#define no_debug(...)  //noop
#define debug(...)  UPTO_20ARGS(__VA_ARGS__, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_1ARG) (__VA_ARGS__)
#define debug_1ARG(msg)  prevout = printf("\n" BLUE_MSG "%s" msg ENDCOLOR_ATLINE_INFO + (prevout > 0), DebugScope::top(": "), rti())
#define debug_MORE_ARGS(msg, ...)  prevout = printf("\n" BLUE_MSG "%s" msg ENDCOLOR_ATLINE_INFO + (prevout > 0), DebugScope::top(": "), __VA_ARGS__, rti())

#define fatal(...)  UPTO_20ARGS(__VA_ARGS__, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_1ARG) (__VA_ARGS__)
#define fatal_1ARG(msg)  (fprintf(stderr, "\n" RED_MSG "%s" "FATAL: " msg ENDCOLOR_ATLINE_INFO + (prevout > 0), DebugScope::top(" "), rti()), exit(1))
#define fatal_MORE_ARGS(msg, ...)  (fprintf(stderr, "\n" RED_MSG "%s" "FATAL: " msg ENDCOLOR_ATLINE_INFO + (prevout > 0), DebugScope::top(" "), __VA_ARGS__, rti()), exit(1))


//#ifdef HAS_SDL
// #undef HAS_SDL
// #pragma message("turning off SDL")
//#endif //def HAS_SDL

//SDL helpers:
//https://wiki.libsdl.org/CategoryAPI
#ifdef HAS_SDL //set by binding.gyp if detected
 #pragma message(CYAN_MSG "using SDL2 to emulate FB" ENDCOLOR_NOLINE)
//#if 1
 #include <SDL.h>
 #define IF_SDL(...)  __VA_ARGS__
//SDL retval conventions:
//0 == Success, < 0 == error, > 0 == data ptr (sometimes)
 #define SDL_Success  0
 #define SDL_NotOK  -2 //OtherError  -2 //arbitrary; anything < 0
 int SDL_LastError = SDL_Success; //remember last error (mainly for debug msgs)
//use overloaded function to handle different SDL retval types:
 inline bool SDL_OK_1ARG(int errcode) { return ((SDL_LastError = errcode) >= 0); }
 inline bool SDL_OK_1ARG(SDL_Window* wnd) { return wnd? true: SDL_OK_1ARG(SDL_NotOK); }
 inline bool SDL_OK_1ARG(SDL_Renderer* rend) { return rend? true: SDL_OK_1ARG(SDL_NotOK); }
 inline bool SDL_OK_1ARG(SDL_Texture* txtr) { return txtr? true: SDL_OK_1ARG(SDL_NotOK); }
//use macro to handle optional message/printf:
 #define SDL_OK(...)  UPTO_10ARGS(__VA_ARGS__, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_2ARGS, SDL_OK_1ARG) (__VA_ARGS__)
//#define SDL_OK_1ARG(errcode)  ((SDL_LastError = (errcode)) >= 0)
 #define SDL_OK_2ARGS(errcode, str)  (!SDL_OK_1ARG(errcode)? (fprintf(stderr, RED_MSG str ": %s (%'d)" ENDCOLOR_ATLINE_INFO, SDL_GetError(), SDL_LastError, rti()), false): true)
 #define SDL_OK_3ORMORE(errcode, fmt, ...)  (!SDL_OK_1ARG(errcode)? (fprintf(stderr, RED_MSG fmt ": %s (%'d)" ENDCOLOR_ATLINE_INFO, __VA_ARGS__, SDL_GetError(), SDL_LastError, rti()), false): true)
#else //no SDL
 #define IF_SDL(...)  //noop
 #define SDL_OK(...)  true
//dummy sttrs to reduce #ifdefs:
 struct SDL_Window {};
 struct SDL_DisplayMode {};
 struct SDL_Renderer {};
 struct SDL_Texture {};
 #define SDL_GetError()  "(no SDL)"
 #define SDL_SetError(...)  //noop
#endif //def HAS_SDL


///////////////////////////////////////////////////////////////////////////////
////
/// color definitions
//

//ANSI color codes (for console output):
//https://en.wikipedia.org/wiki/ANSI_escape_code
//TODO? use user literals instead: https://en.cppreference.com/w/cpp/language/user_literal
//constexpr const char* operator"" RED(const char* str) { return k * 1000UL; }
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
#define ENDCOLOR_ATLINE_INFO  SRCLINE "%s" ENDCOLOR_NEWLINE //with run-time info


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
#define brightness(color)  (R(color) + G(color) + B(color))
//parameter lists:
//#define R_G_B_A(...)  UPTO_3ARGS(__VA_ARGS__, clamp_3ARGS, clamp_2ARGS, clamp_1ARG) (__VA_ARGS__)
#define R_G_B_A(color)  R(color), G(color), B(color), A(color)
#define A_R_G_B(color)  A(color), R(color), G(color), B(color)

#define Abits(color)  ((color) & 0xFF000000) //cbyte(color, -24) //-Ashift)
#define RGBbits(color)  ((color) & 0x00FFFFFF) //((color) & ~ABITS(0xFFffffff))
#define Rbits(color)  ((color) & 0x00FF0000) //cbyte(color, -16) //-Rshift)
#define Gbits(color)  ((color) & 0x0000FF00) //cbyte(color, -8) //-Gshift)
#define Bbits(color)  ((color) & 0x000000FF) //cbyte(color, -0) //-Bshift)

//convert back to external (caller) ARGB order from internal (FB) order:
#define toARGB(a, r, g, b)  ((clamp(a) << 24) | (clamp(r) << 16) | (clamp(g) << 8) | (clamp(b) << 0))


//clamp byte (or other val):
//limit to range 0..0xFF
#define clamp(...)  UPTO_3ARGS(__VA_ARGS__, clamp_3ARGS, clamp_2ARGS, clamp_1ARG) (__VA_ARGS__)
#define clamp_1ARG(val)  clamp_2ARGS(val, 0xFF) //((val) & 0xFF)
//#define clamp_2ARGS(val, shift)  clamp_3ARGS(val, shift, 0xFF)
#define clamp_2ARGS(val, limit)  MIN(limit, MAX(0, val)) //clamp_3ARGS(val, limit, 0)
#define clamp_3ARGS(val, limit, shift_bits)  MIN(limit, MAX(0, shiftlr(val, shift_bits)))

//mask/wrap byte:
#define cbyte(...)  UPTO_3ARGS(__VA_ARGS__, cbyte_3ARGS, cbyte_2ARGS, cbyte_1ARG) (__VA_ARGS__)
#define cbyte_1ARG(val)  ((val) & 0xFF)
#define cbyte_2ARGS(val, shift)  cbyte_3ARGS(val, shift, 0xFF)
#define cbyte_3ARGS(val, shift, mask)  (shiftlr(val, shift) & (mask))


//auto-limit brightness:
#if 0 //let caller select at run time
#define LIMIT_BRIGHTNESS  0xAA //67%
//212 == 83% limit; max 60 => 50 mA / LED
//170 == 67% limit; max 60 => 40 mA / LED
//128 == 50% limit: max 60 => 30 mA / LED
//TODO: auto-brighten? (multiply if < threshold brightness)
#ifdef LIMIT_BRIGHTNESS
 #pragma message(CYAN_MSG "limit WS281x brightness to " TOSTR(LIMIT_BRIGHTNESS) " / 0xFF; move to run-time prop")
 #define auto_dim(element, color)  ((element) * 3 * LIMIT_BRIGHTNESS / MAX(3 * LIMIT_BRIGHTNESS, brightness(color)))
// #define LIMIT(color)  ((auto_dim(color) < 1)? toARGB(A(color), R(color) * auto_dim(color), G(color) * auto_dim(color), B(color) * auto_dim(color)): (color))
//macro intended for use with consts, function for vars:
 #define LIMIT(color)  toARGB(A(color), auto_dim(R(color), color), auto_dim(G(color), color), auto_dim(B(color), color))
 uint32_t limit(uint32_t color)
 {
    int r = R(color), g = G(color), b = B(color);
    int br = r + g + b; //brightness(color);
    if (br <= 3 * LIMIT_BRIGHTNESS) return color;
//    return toARGB(A(color), r, g, b);
    int dimr = r * 3 * LIMIT_BRIGHTNESS / br;
    int dimg = g * 3 * LIMIT_BRIGHTNESS / br;
    int dimb = b * 3 * LIMIT_BRIGHTNESS / br;
//debug("r %d * %d / %d => %d, g %d * %d / %d => %d, b %d * %d / %d => %d", r, 3 * LIMIT_BRIGHTNESS, br, dimr, g, 3 * LIMIT_BRIGHTNESS, br, dimg, b, 3 * LIMIT_BRIGHTNESS, br, dimb);
    return Abits(color) | (dimr << 16) | (dimg << 8) | (dimb << 0); //don't need clamp()
 }
#else
 #define LIMIT(color)  (color) //as-is
 #define limit(color)  (color)
#endif
#if 0 //unit test
int main()
{
    uint32_t colors[] = {::RED, ::GREEN, ::BLUE, ::YELLOW, ::CYAN, ::MAGENTA, ::WHITE, ::WARM_WHITE, ::COOL_WHITE};
    for (int i = 0; i < SIZEOF(colors); ++i) debug("LIMIT %d: 0x%x br %d => 0x%x, limit => 0x%x", LIMIT_BRIGHTNESS, colors[i], brightness(colors[i]), LIMIT(colors[i]), limit(colors[i]));
    return 0;
}
#define main  other_main
#endif //0 unit test
#endif //0 LIMIT_BRIGHTNESS


///////////////////////////////////////////////////////////////////////////////
////
/// helper functions
//

#include <stdio.h>
#include <sys/time.h> //struct timeval, struct timezone
#include <time.h> //struct timespec
#include <sys/stat.h> //struct stat
#include <limits> //std::numeric_limits<>
//#include <vector>
#include <string>


static const char* dummy = setlocale(LC_ALL, ""); //enable commas in printf using "%'d"

//#if __cplusplus < 201100L
// #pragma message(YELLOW_MSG "CAUTION: this file probably needs c++11 or later to compile correctly" ENDCOLOR_NOLINE)
//#endif


//scale (readabililty):
//CAUTION: caller might need "()"
//#define K  *1000UL
//#define M  *1000000UL
//#define m  /1000UL
//#define u  /1000000UL
//use user literals instead: https://en.cppreference.com/w/cpp/language/user_literal
//constexpr long double operator"" _deg ( long double deg )
//{
//    return deg * 3.14159265358979323846264L / 180;
//}
//NOTE: arg types are restricted:
using usrlit_int_t = unsigned long long int;
using usrlit_float_t = long double;
constexpr unsigned long operator"" _K(usrlit_int_t k) { return k * 1000UL; }
constexpr unsigned long operator"" _M(usrlit_int_t m) { return m * 1000000UL; }


//turn null ptr into empty/default str:
inline const char* nvl(const char* str, const char* null = 0)
{
    return (str && str[0])? str: (null && null[0])? null: "";
}


//check if file open:
inline bool isOpen(int fd) { return (fd > 0); } //fd && (fd != -1)); }


//check for file existence:
inline bool fexists(const char* path)
{
    struct stat info;
    return !stat(path, &info); //file exists
}


//str replace:
//caller can call retval.c_str() to get const char* result
std::string& str_replace(const char* str, const char* from, const char* to = 0)
{
    static std::string result;
    result = str;
    size_t fromlen = strlen(from);
    for (;;)
    {
        std::size_t found = result.find(from);
        if (found == std::string::npos) return result;
        result.replace(found, fromlen, nvl(to));
    }
}   
inline std::string& str_replace(const std::string& str, const std::string& from, const std::string& to) { return str_replace(str.c_str(), from.c_str(), to.c_str()); }
//inline std::string& str_replace(const std::string& str, const std::string& from) { return str_replace(str.c_str(), from.c_str()); }
inline std::string& str_replace(const std::string& str, const char* from, const char* to = 0) { return str_replace(str.c_str(), from, to); }
//inline std::string& str_replace(const std::string& str, const char* from) { return str_replace(str.c_str(), from); }


#if 0
//name demangling:
//NOTE: typeid() requires -frtti
//https://stackoverflow.com/questions/3649278/how-can-i-get-the-class-name-from-a-c-object
#include <cxxabi.h>
template <typename ARG>
const char* TypeName(ARG&& arg)
{
    int status;
    const char* demangled = abi::__cxa_demangle(typeid(ARG).name(), 0, 0, &status); //typeid() requires -frtti
    static char buf[200];
    strncpy(buf, demangled, sizeof(buf));
    free((char*)demangled);
    return buf;
}
#if 0 //unit test
//#define quote(x) #x
template <typename foo,typename bar> class one{ };
int main()
{
    one<int,one<double, int> > A;
//    int status;
    const char* demangled = TypeName(A); //abi::__cxa_demangle(typeid(A).name(),0,0,&status);
//    std::cout << demangled << "\t" << TOSTR(A) /*quote(A)*/ << "\n";
    debug("demangled A: '%s'", demangled);
//    free(demangled);
}
#define main  main_other3
#endif //0
#endif //0


//kludge: wrapper to avoid the need for trailing static decl at global scope:
#if 1 //ndef STATIC_WRAP //1
// #ifndef STATIC
//  #define STATIC //should be static but compiler doesn't allow
// #endif
//kludge: use "..." to allow "," within INIT; still can't use "," within TYPE, though
//#define STATIC_WRAP(...)  UPTO_3ARGS(__VA_ARGS__, STATIC_WRAP_3ARGS, STATIC_WRAP_2ARGS, missing_arg) (__VA_ARGS__)
// #define INIT_NONE  //dummy arg for macro
//#define STATIC_WRAP_2ARGS(TYPE, VAR)  STATIC_WRAP_3ARGS(TYPE, VAR, INIT_NONE) //optional third param
 #define STATIC_WRAP  STATIC_WRAP_3ARGS //always init
 #define STATIC_WRAP_3ARGS(TYPE, VAR, /*INIT*/ ...)  \
    static inline TYPE& static_##VAR() \
    { \
        static TYPE m_##VAR /*=*/ /*INIT*/ __VA_ARGS__; \
        return m_##VAR; \
    }; \
    TYPE& VAR = static_##VAR() //kludge-2: create ref to avoid the need for "()"
#else //no worky
 #define STATIC_WRAP  static_wrap
 template <typename TYPE>
 class static_wrap
 {
 public:
    /*no: explicit*/ inline static_wrap(TYPE&& that) { get() = that; } //copy ctor
//    static_wrap(TYPE&& that)
//    inline static_wrap& operator=(TYPE /*&&*/ that) { return get() = that; } //fluent
//    inline static_wrap& operator=(int that)
    inline TYPE& get() { return *this; }
    inline operator TYPE&() const
    {
        static TYPE m_var; //wrapped in method to avoid trailing static decl at global scope; CAUTION: pseudo-static (shared)
        return m_var;
    }
    STATIC friend std::ostream& operator<<(std::ostream& ostrm, const static_wrap& that)
    {
    {
        return ostrm << ((static_wrap)that).get(); //static_cast<TYPE>(that.get());
    }
 };
#endif //1


//convert time struct to msec:
//just use built-in struct; don't need high-precsion?
//NOTE: returns value relative to first time; allows smaller data size
//#define WANT_HIPREC_TIMER
//#ifdef WANT_HIPREC_TIMER
// #define now()  SDL_GetPerformanceCounter() //Uint64
// #define tomsec(ticks)  (1000L * (ticks) / SDL_GetPerformanceFrequency())
//#else
// #define now()  SDL_GetTicks() //Uint32; msec since SDL_Init()
// #define tomsec(ticks)  ticks //as-is
//#endif
using usec_t = unsigned int; //decltype(now_usec()); //long int;
//CAUTION: max range is ~ 1.2 hr
/*long int*/ usec_t now_usec()
{
    struct timeval now;
    struct timezone& tz = *NULL_OF(struct timezone); //relative times don't need this
    if (gettimeofday(&now, &tz)) fatal("gettimeofday"); // 0x%p", &tz);
//    return now_msec(&timeval);
//    static decltype(timeval.tv_sec) started = timeval.tv_sec; //- 1; //set epoch first time called; ignore usec (might cause ovfl prior to substraction)
    static struct timeval started = now; //set epoch first time called
    /*long int*/ usec_t usec = (now.tv_sec - started.tv_sec) * 1e6 + now.tv_usec - started.tv_usec; //won't wrap for relative times
    return usec;
}
//#define time_t  msec_t //kludge: name conflict; use alternate
using msec_t = usec_t; //decltype(now_msec()); //long int;
inline msec_t now_msec() { return now_usec() / 1e3; }


msec_t started = now_msec();
int thrinx(void); //fwd ref
const char* rti()
{
    static char buf[100];
    snprintf(buf, sizeof(buf), " $%d T+%4.3f", thrinx(), (now_msec() - started) / 1e3);
    return buf;
}


//execute a shell command, return results:
//from https://stackoverflow.com/questions/478898/how-do-i-execute-a-command-and-get-the-output-of-the-command-within-c-using-po
//#include <cstdio>
//#include <iostream>
//#include <memory>
//#include <stdexcept>
//#include <string>
//#include <array>
std::string shell(const char* cmd)
{
//    std::array<char, 128> buffer;
    char buffer[128];
    std::string result;
//debug("run shell command '%s' ...", cmd);
    std::unique_ptr<FILE, decltype(&pclose)> pipe(popen(cmd, "r"), pclose);
    if (!pipe) throw std::runtime_error("popen() failed!");
//    while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr) result += buffer.data();
    while (fgets(buffer, sizeof(buffer), pipe.get()) != nullptr) result += buffer;
    std::string& result_esc = str_replace(result.c_str(), "\n", CYAN_MSG "\\n" ENDCOLOR_NOLINE); //esc special chars in debug output
debug("shell '%s' output %'lu:'%s'", cmd, result.length(), result_esc.c_str());
    return result;
}


inline void clear_error()
{
    errno = 0;
//    (void)SDL_ClearError();
    SDL_SetError("."); //"" causes [-Wformat-zero-length] warning
}


//in-line err msg:
//allows printf-style args
//adds line# + SDL or stdio error text to caller-supplied msg
#define errmsg(...)  _errmsg(SRCLINE, __VA_ARGS__) //capture caller's line# for easier debug (needs to be ahead of var args); CAUTION: fmt string supplies at least 1 arg to __VA_ARGS__
//allow (optional) retval/type as second param:
template <typename RETTYPE /*= long*/, typename = typename std::enable_if<!std::is_same<RETTYPE, const char*>::value>::type> //, typename ... ARGS> //, bool NORETVAL = std::is_same<RETTYPE, const char*>::value>
//default to "long" to avoid loss of precision with ptrs
//int _errmsg(const char* srcline, const char* desc, ...) //ARGS&& ... args)
RETTYPE _errmsg(const char* srcline, RETTYPE retval, const char* desc, ...) //ARGS&& ... args)
{
//    const char*& str = NORETVAL? retval: desc;
//TODO: getgrouplist() to check if member of video group?
    const char* reason = nvl(errno? std::strerror(errno): SDL_GetError(), "no details"); //nvl(SDL_GetError(), "(SDL error)");
    constexpr const char* try_sudo = " Try \"sudo\"?"; //std::string try_sudo(" Try \"sudo\".");
    static bool isroot = !geteuid(); //(getuid() == geteuid()); //0 == root
    char fmt[256]; //composite msg fmt string
//    static int isdup = 0;
    static char prevfmt[sizeof(fmt)] = {0};
//    if (!reason[0]) snprintf(fmt, sizeof(fmt), "\n" RED_MSG "%s%s" ENDCOLOR_NEWLINE, desc, srcline); else
    snprintf(fmt, sizeof(fmt), "\n" RED_MSG "%s error (%d): %s.%s%s" ENDCOLOR_NEWLINE, desc, errno? errno: SDL_LastError, reason, &try_sudo[(isroot || !errno)? strlen(try_sudo): 0], srcline);
    strcpy(strend(fmt) - 5, " ..."); //truncation indicator
//    for (char* bp = fmt + 1; bp = strchr(bp, '\n'); *bp = 0xff); //strcpy(bp, bp + 1)); //remove newlines
//printf("err fmt: '%s', errno %d, isroot? %d, dup? %d, prevout %d\n", fmt + 1, errno, isroot, !strcmp(prevfmt, fmt), prevout);
    if (errno) isroot = true; //suggest sudo first time only
    if (!strcmp(prevfmt, fmt)) //dup (probably); include line# in check, but *not* values
    {
        int now = now_msec();
        if ((prevout > 0) || (now + prevout > 1e3)) //show dups 1x/sec
        {
            fprintf(stderr, RED_MSG "." ENDCOLOR_NOLINE); //concise repeat indicator
            prevout = -now; //(prev_outlen > 0)? 0: prev_outlen - 1; //isdup = 1; //next non-dup msg will need to start with line break
        }
//        else fprintf(stderr, RED_MSG ".%'d" ENDCOLOR_NOLINE, now + prevout);
        return(retval);
    }
//    if (prev_outlen) isdup = 0;
    strcpy(prevfmt, fmt);
#if 0 //use perf fwd
//printf("srcline: '%s'\n", srcline);
//printf("fmt: '%s'\n", desc);
    prevout = fprintf(stderr, fmt, std::forward<ARGS>(args) ...);
#else //use va_args
    va_list va_args;
    va_start (va_args, desc);
//        vsnprintf(previous, )
//printf("srcline: '%s'\n", srcline);
//printf("fmt: '%s'\n", desc);
    prevout = vfprintf(stderr, fmt, va_args); //Vargs(desc).args);
//    prevout = vfprintf(stderr, fmt + (prevout > 0), args); //Vargs(desc).args);
    va_end(va_args);
#endif //0
    clear_error(); //reset after reporting
    return(retval);
}

//provide default 0L retval for errmsg():
//kludge: need to overload; can't use partial template specialization :(
template <typename ... ARGS> //template is for perfect fwding here, not specialization of above
inline long _errmsg(const char* srcline, const char* desc, ARGS&& ... args)
{
//printf("errmsg perf fwd ret val 0 from %s\n", srcline);
    return _errmsg<long>(srcline, 0L, desc, std::forward<ARGS>(args) ...); //CAUTION: "0" is ambiguous (matches int/long and char*); need to qualify template
}


//wrapper for 2D addressing:
//NOTE: doesn't use array of arrays but looks like it
//parent manages all memory
//2D singleton: data is in parent
//instances are created in-place (overlaid onto target memory); must be 0 size
//static data is used to avoid instance data (more efficient memory usage for large arrays); a tag parameter is used to allow multiple instances of static data
template <typename TAG_T, typename CHILD_T, typename DATA_T = CHILD_T>
class ary
{
//TODO: drop 2nd arg, handle automatically
//    using data_t = std::conditional<std::is_same<CHILD_T, DATA_T>::value, leaf_t, CHILD_T>::type::m_len; } //simpler than SFINAE
    struct leaf_t { static const size_t m_len = 1; }; //kludge: proxy for data_t
public: //data members
//CAUTION: must not contain instance data due to address placement
//TODO: use STATIC_WRAP?
    static size_t m_len;
    static DATA_T* m_limit; //allow index past end as long as memory is there
    static const char* item_type;
    static inline size_t child_size() { return std::conditional<std::is_same<CHILD_T, DATA_T>::value, leaf_t, CHILD_T>::type::m_len; } //simpler than SFINAE
public: //ctor/dtor
    ary() {}
    ~ary() {}
public: //operators
//no bounds check:
//CAUTION: overlayed on top of m_px mmap array
    inline const CHILD_T& operator[](size_t inx) const
    {
        return *(const CHILD_T*)&((DATA_T*)this)[inx * child_size()];
    }
    inline CHILD_T& operator[](size_t inx) { return const_cast<CHILD_T&>(std::as_const(*this).operator[](inx));  } //non-const variant (DRY)
//with bounds check:
    inline const CHILD_T& at(size_t inx) const
    {
//debug("ary@ %p at limit check: %lu inx scrv. (limit %p - this %p) / chsize %lu", this, inx, m_limit, this, child_size());
        return (inx < /*m_len*/ max_inx())? operator[](inx): oob(inx); //DRY
    }
    inline CHILD_T& at(size_t inx) { return const_cast<CHILD_T&>(std::as_const(*this).at(inx)); } //non-const variant (DRY)
private: //helpers
    inline size_t max_inx() const { return (m_limit && child_size())? (m_limit - (DATA_T*)this) / child_size(): 0; } //allow indexing beyond this row as long as memory is there
    const CHILD_T& oob(size_t inx) const //generate out of bounds error
    {
        char errmsg[99];
        snprintf(errmsg, sizeof(errmsg), "%s index %'lu out of range 0..%'lu", item_type, inx, max_inx()); //m_len);
        strcpy(strend(errmsg) - 5, " ..."); //truncation indicator
        throw new std::out_of_range(errmsg);
        return *NULL_OF(CHILD_T); //NULL;
    }
};


//export C++ classes/objects to Javascript:
#ifdef NODE_GYP_MODULE_NAME //defined by node-gyp
 #include "napi-exports.h"
#else //stand-alone compile; no Javascript
 #define NAPI_START_EXPORTS(...)  //noop
 #define NAPI_EXPORT_PROPERTY(...)  //noop
 #define NAPI_EXPORT_WRAPPED_PROPERTY(...)  //noop
 #define NAPI_EXPORT_METHOD(...)  //noop
 #define NAPI_STOP_EXPORTS(...)  //noop
 #define NAPI_EXPORT_CLASS(...)  //noop
 #define NAPI_EXPORT_OBJECT(...)  //noop
 #define NAPI_EXPORT_MODULES(...)  //noop
#endif //def NODE_GYP_MODULE_NAME
//#ifdef NODE_GYP_MODULE_NAME
// #pragma message("compiled as Node.js add-on")
//#else
// #pragma message("compiled for stand-alone usage")
//#endif


//allow JS to use my debug:
#ifdef USING_NAPI
#pragma message(YELLOW_MSG "TODO: also fatal(); add mutex to prevent msg interleave")
Napi::Value jsdebug(const Napi::CallbackInfo& info)
{
    if ((info.Length() != 1) || !info[0].IsString()) return err_napi(info.Env(), "1 string expected; got %d %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()));
    const /*auto*/ std::string str = info[0].As<Napi::String>();
//    Napi::Env env = info.Env();
//kludge: make it look like debug() but tweak params a little
//    debug("%s", str.c_str());
//    if (str ends with @[^:]+:\d+ENDCOLOR\n?) truncate
    bool has_srcline = true; //TODO
    prevout = printf("\n" BLUE_MSG "%s" BLUE_MSG "%s" "%s" ENDCOLOR_NEWLINE + (prevout > 0), str.c_str(), !has_srcline? SRCLINE: "", rti()); //TODO: fix color spread
    return info.Env().Undefined();
}
#endif //def USING_NAPI


///////////////////////////////////////////////////////////////////////////////
////
/// multi-threaded helpers
//


#include <thread> //std::thread::get_id(), std::thread()
#include <condition_variable>
#include <mutex> //std:mutex<>, std::unique_lock<>
#include <vector>
#include <atomic>  //std::atomic<>, std::atomic_wait(), std::atomic_notify_all()
//#if __cplusplus < 202000L //poly fill
//#endif


typedef decltype(std::this_thread::get_id()) thrid_t;
inline /*auto*/ /*std::thread::id*/ /*const std::thread::id&*/ thrid_t thrid()
{
//TODO: add pid for multi-process uniqueness?
    return std::this_thread::get_id();
}

//reduce verbosity by using a unique small int instead of thread id:
int thrinx(/*const thrid_t&*/ /*std::thread::id*/ /*auto*/ thrid_t myid) // = thrid())
{
//TODO: move to shm
    static std::vector</*std::decay<decltype(thrid())>*/ /*std::thread::id*/ thrid_t> ids;
//    static thrid_t ids[10] = {0};
    static std::mutex mtx;
    int retval;
  { //inner scope for lock
    std::unique_lock<decltype(mtx)> lock(mtx);

    for (auto it = ids.begin(); it != ids.end(); ++it)
        if (*it == myid) return it - ids.begin();
    /*int newinx*/ retval = ids.size();
    ids.emplace_back(myid); //push_back(myid);
  }
//    fprintf(stderr, "new thread[%d] id %d\n", retval, myid);
    debug("new thread 0x%lx, pid %d", myid, getpid()); //CAUTION: recursion into above section
    return retval;
}
int thrinx() { return thrinx(thrid()); }


//thread sync helper:
//container class should use static instances for mutex to work
//not needed- tag parameter can be used to allow multiple instances (avoids conflict with shared members)
template <typename VALTYPE> //, int TAG = __LINE__>
class MultiSync //: public std::atomic<VALTYPE>
{
    std::atomic<VALTYPE> m_val; //atomic to allow safe access without lock
//NOTE: Even if the shared variable is atomic, it must be modified under the mutex in order to correctly publish the modification to the waiting thread; see https://en.cppreference.com/w/cpp/thread/condition_variable
//CAUTION: use .load() with atomics in debug()
//    std::atomic<int> m_waiters; //for debug; NOT RELIABLE: pred could ret false
    std::atomic<msec_t> m_timestamp; //time of last update (used for latency analysis)
    /*static*/ std::mutex m_mtx; //avoid mutex locks except when waiting; //PTHREAD_MUTEX_INITIALIZER?
    /*std::atomic<std::condition_variable>*/ std::condition_variable m_cv;
//    static std::condition_variable m_cv;
//use wrappers to allow inline decl:
//    static inline std::mutex& mtx() { static std::mutex mtx = 0; return mtx; } //avoid mutex locks except when waiting; //PTHREAD_MUTEX_INITIALIZER?
//    static inline /*std::atomic<std::condition_variable>*/std::condition_variable& cv() { static /*std::atomic<std::condition_variable>*/std::condition_variable cv = 0; return cv; } //avoid mutex locks except when waiting
    using LOCKTYPE = std::unique_lock<decltype(m_mtx)>; //not: std::lock_guard<decltype(m_mtx)>;
public: //types
    using value_t = VALTYPE;
public: //ctors/dtors
    explicit inline MultiSync(VALTYPE init = 0): m_val(init), /*m_waiters(0),*/ m_timestamp(0)
    {
        static int count = 0;
        no_debug("MultiSync ctor[%d] init %d, process id %d", count++, init, getpid());
    }
    ~MultiSync() { no_debug("MultiSync dtor"); }
//public: //properties
//    msec_t timestamp() const { return m_timestamp; }
public: //operators
    inline operator VALTYPE() { return load(); }
    inline /*VALTYPE*/ MultiSync& operator=(VALTYPE newval) { store(newval); return *this; } //load(); } //m_val = newval; //m_cv.notify_all();
    inline VALTYPE operator|=(VALTYPE moreval) { fetch_or(moreval); return load(); } //m_val |= moreval; 
public: //methods
//make interchangeable with std::atomic<>:
//TODO: perfect fwd or derive?
    inline VALTYPE /*auto*/ load() const { return m_val.load(); }
//    inline bool hasval(VALTYPE want_val) const { return load() == want_val; }
    inline void store(VALTYPE newval) //, SrcLine srcline = 0)
    {
//        if (WANT_DEBUG) DEBUG("BkgSync = 0x" << std::hex << newval << std::dec, srcline);
//debug("store 0x%x", newval);
        LOCKTYPE lock(m_mtx); //NOTE: mutex must be held while var is changed even if atomic, according to https://en.cppreference.com/w/cpp/thread/condition_variable
//        want_or? m_val |= newval: m_val = newval;
        VOID m_val.store(newval);
        VOID notify(); //srcline);
    }
    inline /*auto*/ VALTYPE fetch_or(VALTYPE bits) //, SrcLine srcline = 0)
    {
//        if (WANT_DEBUG) DEBUG("BkgSync |= 0x" << std::hex << bits << std::dec, srcline);
//debug("fetch-or 0x%x", bits);
        LOCKTYPE lock(m_mtx); //NOTE: mutex must be held while var is changed even if atomic, according to https://en.cppreference.com/w/cpp/thread/condition_variable
        VALTYPE oldval = m_val.fetch_or(bits);
        VOID notify(); //srcline);
        return oldval; //give *old* value to caller
    }
    msec_t age() const { return now_msec() - m_timestamp; }
    void notify() //SrcLine srcline = 0)
    {
//        if (WANT_DEBUG) DEBUG("BkgSync notify all, val " << load(), srcline);
no_debug("notify (all) waiters, value 0x%x", /*m_waiters.load(),*/ m_val.load());
////        all? m_cv.notify_all(): m_cv.notify_one();
//        m_cv.notify_all();
        m_timestamp = now_msec();
//        if (!m_waiters) return;
//        m_waiters = 0;
//too late:        LOCKTYPE lock(m_mtx); //NOTE: mutex must be held while var is changed even if atomic, according to https://en.cppreference.com/w/cpp/thread/condition_variable
        VOID m_cv.notify_all();
    }
//    typedef std::function<bool(VALTYPE)> CANCEL; //void* (*REFILL)(mySDL_AutoTexture* txtr); //void);
//    typedef bool (*::CANCEL)(VALTYPE);
//    template <uint_t BITS>
//    /*static*/ bool wait_for_value(VALTYPE val) { return m_val == val; }
//    using CANCEL = decltype(wait_for_value);
//    typedef static bool (*cancel_t)(VALTYPE);
//C++ can't convert lambda with capture to function ptr :(
//kludge: add a "this" parameter; other option: hard-code the value :(
//    static bool cancel_example(MultiSync* THIS, VALTYPE value) { return THIS->m_val == value; }
    typedef STATIC bool cancel_t(MultiSync*, VALTYPE); //{ return THIS->m_val == value; }
//    using cancel_t = decltype(cancel_example);
//        template <typename ... ARGS>
//    int open(const char* path, int flags, ARGS&& ... args)
//    template<typename CANCEL_T> //kludge: can't get lamba types to resolve, so just let template handle it
    bool wait(VALTYPE want_value /*= 0*/, /*CANCEL_T&&*/cancel_t* cancel /*= NULL*/, bool blocking = true) //, SrcLine srcline = 0)
    {
//        if (WANT_DEBUG) DebugInOut(YELLOW_MSG "BkgSync wait for 0x" << std::hex << want_value << std::dec << " (" << &"non-blocking"[blocking? 4: 0] << "): thr# " << thrinx() << ", cur val 0x" << std::hex << load() << " or 0x" << m_val << std::dec << ", match? " << (load() == want_value) << ATLINE(srcline));
no_debug("wait: blocking? %d, val 0x%x, match? %d", /*want_value,*/ blocking, /*m_waiters.load(),*/ m_val.load(), (*cancel)(this, want_value));
//        if (!cancel) cancel = &cancel_onvalue; //[want_value](VALTYPE m_val) { return m_val == want_value; }; //&wait_for_value;
//        if (load() == want_value) return true; //no need to wait, already has desired value
        if (!blocking) return (*cancel)(this, want_value); //check without waiting
//        if (cancel(m_val)) return true; //no need to wait, already has desired value
//        if (blocking)
//        {
//            if (WANT_DEBUG) DEBUG("BkgSync lock and wait", srcline);
        LOCKTYPE lock(m_mtx); //NOTE: mutex must be held while waiting even if atomic, according to https://en.cppreference.com/w/cpp/thread/condition_variable
//debug("here1 %d", m_val.load());
        if ((*cancel)(this, want_value)) return false;
//debug("here2 %d", m_val.load());
//        ++m_waiters; //notify() will reset this
        m_cv.wait(lock, [this, want_value, cancel]() -> bool { no_debug("wakeup, val 0x%x, want 0x%x, match? %d", m_val.load(), want_value, (*cancel)(this, want_value)); return (*cancel)(this, want_value); }); //filter out spurious wakeups
        if (!(*cancel)(this, want_value)) debug(RED_MSG "shouldn't have woken: val 0x%x, wanted 0x%x", m_val.load(), want_value);
//            {
//                if (cancel && cancel(m_val)) return true;
//                return load() == want_value; //filter out spurious wakeups
//already cleared:                --m_waiters;
//                return cancel(m_val); //filter out spurious wakeups
//            });
//        }
//debug("here4 %d", m_val.load());
        return true; //blocking;
    }
//C++ can't convert lambda with capture to function ptr :(
//kludge: add a "this" parameter; other option: hard-code the value :(
    inline bool wait4value(VALTYPE want_value, int cmp = 0, bool blocking = true)
    {
        const char* relop = (cmp < 0)? "<": (cmp > 0)? ">": "=";
        no_debug("wait for value %s 0x%x, cur 0x%x", relop, want_value, m_val.load());
//broken        return wait([want_value](VALTYPE m_val) -> bool { return m_val == want_value; });
//yuk        switch (want_value)
//        {
//            case (VALTYPE)-1: return wait([](VALTYPE m_val) -> bool { return m_val == (VALTYPE)-1; });
//            default: debug(RED_MSG "wait4val(%d) !implemented", want_value);
//        }
//        return false;
        cancel_t* match = (cmp < 0)? [](MultiSync* THIS, VALTYPE val) -> bool { return THIS->m_val < val; }:
            (cmp > 0)? [](MultiSync* THIS, VALTYPE val) -> bool { return THIS->m_val > val; }:
            [](MultiSync* THIS, VALTYPE val) -> bool { return THIS->m_val == val; };
        bool retval = wait(want_value, match); //[](MultiSync* THIS, VALTYPE val) -> bool { return THIS->m_val == val; });
        bool ok = match(this, want_value); //? GREEN_MSG: RED_MSG;
no_debug("%swoke with value %s 0x%x? %d, wanted 0x%x", ok? GREEN_MSG: RED_MSG, relop, m_val.load(), ok, want_value);
        return retval;
    }
#if 0 //is this still needed?
    inline bool wait4bits0(VALTYPE want_bits, bool blocking = true)
    {
        no_debug("wait for bits off 0x%x, cur val 0x%x", want_bits, m_val.load());
//broken        return wait([want_bits](VALTYPE m_val) -> bool { return !(m_val & want_bits); });
//yuk        switch (want_bits)
//        {
//            case 0xF: return wait([](VALTYPE m_val) -> bool { return !(m_val & 0xF); });
//            case 0xF0: return wait([](VALTYPE m_val) -> bool { return !(m_val & 0xF0); });
//            case 0xF00: return wait([](VALTYPE m_val) -> bool { return !(m_val & 0xF00); });
//            case 0xFF: return wait([](VALTYPE m_val) -> bool { return !(m_val & 0xFF); });
//            case 0xFF00: return wait([](VALTYPE m_val) -> bool { return !(m_val & 0xFF00); });
//            case 0xFF0000: return wait([](VALTYPE m_val) -> bool { return !(m_val & 0xFF0000); });
//            default: debug(RED_MSG "wait4bits0(%d) !implemented", want_bits);
//        }
//        return false;
        bool retval = wait(want_bits, [](MultiSync* THIS, VALTYPE bits) -> bool { return !(THIS->m_val & bits); });
        const char* ok = !(m_val & want_bits)? GREEN_MSG: RED_MSG;
no_debug("%swoke with bits 0x%x, wanted 0x%x", ok, m_val.load(), want_bits);
        return retval;
    }
#endif
};
//template<> STATIC decltype(MultiSync::m_mtx) MultiSync::m_mtx; //= decltype(MultiSync::m_mtx); //PTHREAD_MUTEX_INITIALIZER?
//template<> STATIC decltype(MultiSync::m_cv) MultiSync::m_cv = decltype(MultiSync::m_cv)(0); //https://stackoverflow.com/questions/20453054/initialize-static-atomic-member-variable
    

#if 1 //thread sync test
class SyncTest
{
    NAPI_START_EXPORTS(SyncTest);
    static MultiSync<uint32_t> m_ready;
    using ready_value_t = decltype(m_ready)::value_t;
//    static std::atomic<msec_t> m_frstamp; //current frame time for wkers to render
//    using frstamp_t = msec_t;
    static MultiSync<int> m_frstamp;
    using frstamp_value_t = decltype(m_frstamp)::value_t;
public: //ctor/dtor
    SyncTest()
    {
//        if (isMainThread) m_frnum = m_ready = 0; //wkers can start on first frame immediately
        debug("SyncTest ctor: ismain? %d", !thrinx());
    }
    ~SyncTest() {}
private: //ctor helpers (member init)
//    inline decltype(m_frnum) frnum() const { return m_frnum; } //static -> instance shim
//    inline void frnum(decltype(m_frnum) newf) { m_frnum = newf; }
//    NAPI_EXPORT_PROPERTY(SyncTest, frnum, frnum);
    inline frstamp_value_t frstamp() const { return m_frstamp; } //static -> instance shim
    inline void frstamp(frstamp_value_t newst) { m_frstamp = newst; }
    NAPI_EXPORT_PROPERTY(SyncTest, frstamp, frstamp);
    inline ready_value_t ready() const { return m_ready; } //static -> instance shim
    inline void ready(ready_value_t newr) { if (newr) m_ready |= newr; else m_ready = newr; } //turn some bits on (wker threads) or all bits off (main thread) + notify waiting threads
    NAPI_EXPORT_PROPERTY(SyncTest, ready, ready);
    inline decltype(m_ready.age()) ready_age() const { return m_ready.age(); }
    NAPI_EXPORT_PROPERTY(SyncTest, ready_age);
//    inline decltype(::thrid()) thrid() const { return ::thrid(); }
//    NAPI_EXPORT_PROPERTY(Pivot24, thrid);
    inline decltype(::thrinx()) thrinx() const { return ::thrinx(); }
    NAPI_EXPORT_PROPERTY(SyncTest, thrinx);
//wait for bits off:
//    bool ready_wait(ready_value_t bits) //offbits)
//    {
//        return (!offbits || (offbits == (ready_value_t)-1))?
//            m_ready.wait4value(-1): //wait for all bits on (main thread)
//            m_ready.wait4bits0(offbits); //wait for selected bits off (wker threads)
//    }
//    bool frstamp_wait(frstamp_value_t frstamp, int cmp = 0)
//    {
//        return m_frstamp.wait4value(frstamp, cmp); //wait for value >
//    }
#ifdef USING_NAPI
    Napi::Value awaitready_method(const Napi::CallbackInfo& info)
    {
//debug("async method: #args %d, arg[0] %s", info.Length(), NapiType(info[0]));
        if (!info.Length() || !info[0].IsNumber()) return err_napi(info.Env(), "value/bits (1 Number) expected; got %d %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()));
//        const auto delay_msec = info[0].As<Napi::Number>().Int32Value();
        ready_value_t wait4val = /*info.Length()?*/ info[0].As<Napi::Number>().Int32Value();
        auto async_exec = [this, wait4val]() -> bool { return m_ready.wait4value(wait4val); }; //ready_wait(wait4bits); };
//debug("out(%'d), dirty? %d", delay_msec, dirty());
        NAPI_ASYNC_RETURN(async_exec);
    }
    NAPI_EXPORT_METHOD(SyncTest, "await_ready", awaitready_method);
//allow sync or async versions:
    template<bool ASYNC>
    Napi::Value awaitfrstamp_method(const Napi::CallbackInfo& info)
    {
//debug("async method: #args %d, arg[0] %s", info.Length(), NapiType(info[0]));
        if (!info.Length() || !info[0].IsNumber() || (info.Length() > 2) || ((info.Length() > 1) && !info[1].IsNumber())) return err_napi(info.Env(), "1-2 values (Numbers) expected; got %d %s %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()), NapiType((info.Length() > 1)? info[1]: info.Env().Undefined()));
//        const auto delay_msec = info[0].As<Napi::Number>().Int32Value();
        frstamp_value_t wait4frstamp = /*info.Length()?*/ info[0].As<Napi::Number>().Int32Value();
        int cmp = (info.Length() > 1)? info[1].As<Napi::Number>().Int32Value(): 0;
        if (ASYNC)
        {
            auto async_exec = [this, wait4frstamp, cmp]() -> bool { return m_frstamp.wait4value(wait4frstamp, cmp); };
//debug("out(%'d), dirty? %d", delay_msec, dirty());
            NAPI_ASYNC_RETURN(async_exec);
        }
        else //sync ret (blocking)
            return Napi::Number::New(info.Env(), m_frstamp.wait4value(wait4frstamp, cmp));
    }
//kludge: wrapper allows macro to use templated param:
    inline Napi::Value awaitfrstamp_method_true(const Napi::CallbackInfo& info) { return awaitfrstamp_method<true>(info); }
    inline Napi::Value awaitfrstamp_method_false(const Napi::CallbackInfo& info) { return awaitfrstamp_method<false>(info); }
    NAPI_EXPORT_METHOD(SyncTest, "await_frstamp", awaitfrstamp_method_true); //awaitfrstamp_method<true>);
    NAPI_EXPORT_METHOD(SyncTest, "wait_frstamp", awaitfrstamp_method_false); //awaitfrstamp_method<false>);
#endif //def USING_NAPI
    NAPI_STOP_EXPORTS(SyncTest);
};
NAPI_EXPORT_CLASS(SyncTest);
STATIC decltype(SyncTest::m_frstamp) SyncTest::m_frstamp = decltype(SyncTest::m_frstamp)(0);
STATIC decltype(SyncTest::m_ready) SyncTest::m_ready = decltype(SyncTest::m_ready)(0);
#endif


#ifdef WANT_AUDIO
///////////////////////////////////////////////////////////////////////////////
////
/// audio playback
//

#include <ao/ao.h>
#include <mpg123.h>

//NOTE: this is in here because it can also be driven by GPU (connect a VGA GPIO pin to DAC)
//TODO: restructure code to work that way :P
#pragma message("audio: err checking, refactor into typical JS callback loop")

//ao lib wrapper
//doc warns against calls init without a shutdown, so use a wrapper class that can be used as a static member
//class AO
//{
//public: //ctor/dtor
//    AO() { (VOID)ao_initialize(); }
//    ~AO() { (VOID)ao_shutdown(); }
//};

class AudioPB
{
    NAPI_START_EXPORTS(AudioPB);
//    using buf_type = unsigned char;
    unsigned char* m_buf;
    int m_driver;
    ao_device* m_dev;
    size_t m_bufsize; //max decoded frame size
    mpg123_handle* m_mh;
    ao_sample_format m_fmt;
    std::string m_path;
    bool m_minit;
//    /*static*/ AO aolib;
public: //ctor/dtor
    AudioPB(): m_driver(0), m_mh(0), m_dev(0), /*m_bufsize(0),*/ m_buf(0), m_minit(false)
    {
//TODO: does this need to be static?
        VOID ao_initialize();
        m_driver = ao_default_driver_id();
        int mok = mpg123_init();
        if (mok != MPG123_OK) { debug("mpg123 init err: %d", mok); return; }
        m_minit = true;
        int err;
        m_mh = mpg123_new(NULL, &err);
        if (!m_mh) { debug("mpg123_new err: %d", err); return; }
        m_bufsize = mpg123_outblock(m_mh);
        m_buf = (decltype(m_buf))malloc(m_bufsize * sizeof(m_buf[0]));
debug("audioPB init okay, dev %d", !!m_dev);
    }
    ~AudioPB()
    {
        close();
        if (m_buf) free(m_buf);
        m_buf = 0;
//TODO: does this need to be static?
        if (m_minit) VOID mpg123_exit();
        VOID ao_shutdown();
    }
#if 0 //TODO?
//public: //singleton:
    static std::vector<AudioPB*> m_all;
    static inline AudioPB& any() { return *m_all.back(); }
#ifndef USING_NAPI
    template <typename ... ARGS>
    inline static AudioPB*& singleton(ARGS&& ... args)
    {
        static AudioPB* m_singleton = /*SUPER::singleton() =*/ new AudioPB(std::forward<ARGS>(args) ...); //first time only; CAUTION: override base singleton also
        return m_singleton;
    }
#endif //USING_NAPI
#endif //0 TODO?
//public: //properties
//read-only properties:
    inline decltype(m_fmt.rate) rate() const { return m_path.length()? m_fmt.rate: 0; }
    NAPI_EXPORT_PROPERTY(AudioPB, rate);
    inline decltype(m_fmt.channels) channels() const { return m_path.length()? m_fmt.channels: 0; }
    NAPI_EXPORT_PROPERTY(AudioPB, channels);
    inline decltype(m_fmt.bits) bits() const { return m_path.length()? m_fmt.bits: 0; }
    NAPI_EXPORT_PROPERTY(AudioPB, bits);
//rw props:
    inline const char* path() const { return m_path.c_str(); }
    inline void path(const std::string& str) { path(str.c_str()); }
    void path(const char* str)
    {
        close();
        m_path = str;
        if (!m_path.length()) return;
        open();
    }
    NAPI_EXPORT_PROPERTY(AudioPB, path, path);
public: //methods
    int m_num_buf;
    inline decltype(m_num_buf) num_buf() const { return m_num_buf; }
    NAPI_EXPORT_PROPERTY(AudioPB, num_buf);
    size_t m_data_len;
    inline decltype(m_data_len) data_len() const { return m_data_len; }
    NAPI_EXPORT_PROPERTY(AudioPB, data_len);
    int play() //const char* path)
    {
debug("audio playback: '%s', minit? %d, mh? %d, dev? %d", m_path.c_str(), m_minit, m_mh, m_dev);
        if (!m_path.length()) return 0; //no file
        if (!m_minit) return 0; //mpg123_init failed
        if (!m_mh) return 0; //mpg123_new failed
        if (!m_dev) return 0; //device !open
//open file + get decoding fmt:
        m_num_buf = 0;
        int BPS = m_fmt.rate * m_fmt.channels * m_fmt.bits / 8;
        if (!BPS) { debug("no bps"); return 0; }
        msec_t mp3time = 0, aotime = 0, now = now_msec(), elapsed = -now;
//    while (mpg123_read(mh, buffer, buffer_size, &done) == MPG123_OK) //rd+dec
        bool ok;
        for (;;)
        {
            mp3time -= now;
            size_t done;
            int merr = mpg123_read(m_mh, m_buf, m_bufsize, &done); //read + decode
            ok = (merr == MPG123_OK);
            now = now_msec();
            mp3time += now;
            if (!ok) debug("mpg123_read err: %d", merr);
            if (!ok) break;
//use mpg123_framedata() or mpg123_framepos() to get frame info?
            aotime -= now; 
            ok = ao_play(m_dev, (char*)m_buf, done);
            now = now_msec();
            aotime += now;
            if (!ok) debug("ao_play err: %d", errno);
            if (!ok) break;
            ++m_num_buf;
        }
        elapsed += now_msec();
        m_data_len = m_bufsize * m_num_buf;
debug("#bufs %'d, total data %'lu, duration %4.3f, elapsed %4.3f sec, mp3 time %4.3f sec (%2.1f%%), ao time %4.3f sec (%2.1f%%)\n", m_num_buf, m_data_len, (double)m_data_len / BPS, (double)elapsed / 1e3, (double)mp3time / 1e6, 100.0 * mp3time / elapsed, (double)aotime / 1e6, 100.0 * aotime / elapsed);
        return m_data_len; //TODO: more useful ret val?
    }
#ifdef USING_NAPI
    Napi::Value play_method(const Napi::CallbackInfo& info)
    {
//        if ((info.Length() != 1) || !info[0].IsString()) 
        if (info.Length()) return err_napi(info.Env(), "0 args expected; got %d %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()));
//        const /*auto*/ std::string str = info[0].As<Napi::String>();
        auto async_exec = [this]() -> int { return play(); };
        NAPI_ASYNC_RETURN(async_exec);
    }
    NAPI_EXPORT_METHOD(audiopb, "play", play_method);
#endif //def USING_NAPI
//helpers:
//private:
    bool open()
    {
debug("audio open, dev? %d, mh? %d", !!m_dev, !!m_mh);
        if (m_dev) { debug("dev already open"); return false; }
        int merr = m_mh? mpg123_open(m_mh, m_path.c_str()): -1;
        bool ok = (merr == MPG123_OK);
        if (!ok) debug("mpg123_open err: %d", merr);
        if (!ok) return false;
//        int channels, encoding;
        long rate;
        int encoding;
        merr = mpg123_getformat(m_mh, &rate, &m_fmt.channels, &encoding);
        if (!ok) debug("mpg123_getformat err: %d", merr);
        if (!ok) return false;
        m_fmt.rate = rate; //long int -> int
//debug("rate: %'ld, channels %d, encoding %d", rate, channels, encoding);
//set output fmt + open output device:
        static constexpr int BITS = 8;
        m_fmt.bits = mpg123_encsize(encoding) * BITS;
        if (!m_fmt.bits) { debug("mpg123_encsize error"); return false; }
//        fmt.rate = rate;
//        fmt.channels = channels;
        m_fmt.byte_format = AO_FMT_NATIVE;
        m_fmt.matrix = 0;
        m_dev = ao_open_live(m_driver, &m_fmt, NULL);
//decode + play:
        int BPS = m_fmt.rate * m_fmt.channels * m_fmt.bits / 8;
printf("buf size %'lu = %4.3f sec, bits %d, rate %'d, channels %d, BPS %'d, err? %d errno %d\n", m_bufsize, (double)m_bufsize / BPS, m_fmt.bits, m_fmt.rate, m_fmt.channels, BPS, !!m_dev, errno);
        return m_dev;
    }
    void close()
    {
        if (m_dev)
            if (!ao_close(m_dev)) debug("error from ao_close", errno);
        m_dev = 0;
        if (m_mh)
        {
            int merr = mpg123_close(m_mh);
            if (merr != MPG123_OK) debug("mpg123_close err: %d", merr);
            VOID mpg123_delete(m_mh);
        }
        m_mh = 0;
    }
    NAPI_STOP_EXPORTS(AudioPB); //public
};
//STATIC decltype(CFG::m_all) CFG::m_all;
NAPI_EXPORT_CLASS(AudioPB, "Audio");
#endif //def WANT_AUDIO


#ifdef WANT_FB
///////////////////////////////////////////////////////////////////////////////
////
/// frame buffer I/O (low level)
//

//2 scenarios are supported:
//- on XWindows; use SDL (XWindows) to simulate full screen
//- bare console; use full screen with FB device (faster than SDL2/OpenGL?, can't get dual monitor working with SDL2); perf needed on RPi
//both scenarios work with RPi or dev PC, maybe ssh

#include <unistd.h> //open(), close()
#include <stdio.h> //close()
//#include <cstdio> //sscanf
#include <fcntl.h> //open(), O_RDWR
#include <sys/ioctl.h> //ioctl()
#include <linux/fb.h> //FBIO_*, struct fb_var_screeninfo, fb_fix_screeninfo
#include <sys/mman.h> //mmap()
#include <stdexcept> //out_of_range
#include <vector> //std::vector<>
#include <map> //std::map<>


//RPi clock stored in KHz, XWindows pixclock stored in psec
//RPi 20 MHz (20K) <=> XWindows 50K psec (50K)
//use this macro to convert in either direction:
#define psec2KHz(clk)  (1000000000UL / (clk)) //(1e9 / (clk)) //((double)1e9 / clk)


//cursor control:
//turn cursor off when using framebuffer (interferes with pixels in that area)
//https://en.wikipedia.org/wiki/ANSI_escape_code#Escape_sequences
const char* CURSOFF = "\x1B[?25l";
const char* CURSON = "\x1B[?25h";


//friendlier names for SDL special param values:
//#define UNUSED  0
#define DONT_CARE  0
#define ENTIRE_RECT  NULL
#define DEFAULT_DRIVER  0
#define FIRST_RENDERER_MATCH  -1


//change row len:
// oldlen  newlen  xyofs
//  5       6      0..4 => 0..4
//  5       6      5..9 => 6..10  //skipped ofs
//  5       4      0..4 => 0..4
//  5       4      5..9 => 4..8  //duplicate ofs
size_t rerow(size_t xyofs, size_t oldlen, size_t newlen)
{
    return xyofs / oldlen * newlen + xyofs % oldlen;
}


//FB low-level I/O:
//caches fb info for caller
//hides/simplifies OS api
//2 scenarios:
//- if XWindows is running, emulate FB using SDL window
//- if running in console, use FB/stdio
//NOTE: caller always sees ARGB byte order; FB class will swap byte order internally if needed
//#define LAZY_TEXTURE //don't create until caller uses pixels
class FBIO
{
    NAPI_START_EXPORTS(FBIO);
//    using __CLASS__ = FBIO; //in lieu of built-in g++ macro
//check for XWindows, DEFER TO Std FB functions:
//FB not working with XWindows (also tried xorg FB driver) :(
//    /*static*/ const /*bool*/int CFG.isXWindows = (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
//protected: //SDL not working with FB, so emulate it here  :(
//TODO: use constexpr?
//    static const int FAKED_FD() { return 1234; } //CAUTION: use static method to avoid init order problem (fb_open needs this value)
//#ifdef HAS_SDL
//    enum { FAKED_FD = 1234 };
//private:
    SDL_Window* sdl_window; //= 0;
//    SDL_DisplayMode sdl_mode; //= {0}; //CAUTION: do not re-init after calling FB delegated ctor
    SDL_Renderer* sdl_renderer; //= 0;
    SDL_Texture* sdl_texture; //= 0;
    uint32_t* m_pixels; //= 0;
//#endif //def HAS_SDL
//    constexpr const int DDIRTY = 2; //true; //double buffer requires 2 repaints? (1x/buffer)
    /*bool*/ int m_dirty; //= false;
    int m_fd;
//    bool& isXWindows = cfg.isXWindows();
//public:
//#if 1
//TODO: use STATIC_WRAP?
//    static const /*bool*/int CFG.isXWindows; //= (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
//    static const int CFG.isRPi;
//    static std::string timing;
//#else
//    STATIC_WRAP(int, CFG.isXWindows, = (nvl(getenv("DISPLAY"))[0] == ':')); //is XWindows running
//    STATIC_WRAP(int, CFG.isRPi, = fexists("/boot/config.txt"));
//    STATIC_WRAP(std::string, timing, = shell("vcgencmd get_config str | grep timing")); //ls ."));
//#endif
protected:
//    bool m_wantvis;
    struct my_var_screeninfo: /*struct*/ fb_var_screeninfo //add convenience functions
    {
//            using xyres_t = decltype(var.xres);
//        inline bool isOpen() const { return (fd > 0); }
        my_var_screeninfo() { memset(this, 0, sizeof(*this)); }
        inline decltype(xres) xtotal() const { return xres + left_margin + hsync_len + right_margin; }
        inline decltype(yres) ytotal() const { return yres + upper_margin + vsync_len + lower_margin; }
        inline /*auto*/ /*uint32_t*/ float frtime() const { return (double)xtotal() * pixclock / 1e3 * ytotal() / 1e3; } //usec; kludge: split up 1e6 factor to prevent overflow
        inline /*auto uint32_t*/ float fps() const { /*debug("frtime %'3.2f usec => %3.2f fps", frtime(), 1e6 / frtime())*/; return 1e6 / frtime(); }
        bool match(const struct fb_var_screeninfo that) { return ((xres == that.xres) && (yres == that.yres) && (pixclock == that.pixclock)); } //probably the same config
    };
    struct screeninfo_t
    {
        int fb; //fb#
        bool isvalid;
        char fbdev[30]; //device name
        struct my_var_screeninfo var;
        struct fb_fix_screeninfo fix;
//        screeninfo_t(): fb(-1), isvalid(false), fbdev("") {}
//ctor:
        screeninfo_t(int fb = 0): fb(fb), isvalid(isvalid), var(var), fix(fix) { memset(this, 0, sizeof(*this)); this->fb = fb; } //dummy inits to avoid [-Weffc++] warnings
//convenience functions:
//        void debug(const char* desc, const char* srcline = SRCLINE)
//        {
//            debug("%s fb%d '%s': xres %'d + %'d+%'d+%'d = xtotal %'d, yres %'d + %'d+%'d+%'d = ytotal %'d, pixclock %'d psec (%'d KHz) => %3.1f fps, valid? %d, want_vis? %d, has txtr? %d %s", desc, fb, fbdev, var.xres, var.left_margin, var.hsync_len, var.right_margin, var.xtotal(), var.yres, var.upper_margin, var.vsync_len, var.lower_margin, var.ytotal(), var.pixclock, (int)psec2KHz(var.pixclock), var.fps(), isvalid, srcline); //, want_vis, !!sdl_texture);
//        }
    };
    screeninfo_t m_scrinfo; //= {-1, false};
    decltype(m_scrinfo.var)& scrv = m_scrinfo.var; //reduce verbosity
    decltype(m_scrinfo.fix)& scrf = m_scrinfo.fix; //reduce verbosity
    using pixclock_t = decltype(scrv.pixclock);
//    int m_fd;
//    const char* m_which;
public: //ctors/dtors
    FBIO(/*const char* which = "unnamed"*/): /*m_which(which),*/ sdl_window(/*sdl_window*/ 0), /*sdl_mode(sdl_mode),*/ sdl_renderer(/*sdl_renderer*/ 0), sdl_texture(/*sdl_texture*/ 0), m_pixels(/*m_pixels*/ 0), m_dirty(/*m_dirty*/ false), m_fd(/*m_fd*/ -1), m_scrinfo(m_scrinfo) {} //debug("FBIO@ 0x%p %s ctor()", this, m_which); } //, m_wantvis(true) {} //debug("FBIO ctor"); } //kludge: satisfy compiler (init vars), but avoid overwriting already-initialized data (if openfb called by deriver class)
    ~FBIO() { /*if (isOpen())*/ close(); } //debug("FBIO@ 0x%p %s dtor()", this, m_which); } //m_scrinfo.fd); }
//    {
//        myPropDesc<FBIO> prop("dirty", myPropDesc<FBIO>::property, &FBIO::NAPWRAPG(dirty), &FBIO::NAPWRAPS(dirty));
//debug("FBIO: dirty getter 0x%p, setter 0x%p", prop.getter, prop.setter);
//        debug("FBIO ctor %lu:%'d x %lu:%'d, wnd %lu:%p, rend %lu:%p, txtr %lu:%p, px %lu:%p, dirty %lu:%d", sizeof(sdl_mode.w), sdl_mode.w, sizeof(sdl_mode.h), sdl_mode.h, sizeof(sdl_window), sdl_window, sizeof(sdl_renderer), sdl_renderer, sizeof(sdl_texture), sdl_texture, sizeof(m_pixels), m_pixels, sizeof(m_dirty), m_dirty); //, &sdl_mode);
//    }
    FBIO(const FBIO& that): FBIO() { m_scrinfo = that.m_scrinfo; } //avoid [-Weffc++] warning
public: //operators
    FBIO& operator=(const FBIO& that) { new (this) FBIO(that); return *this; } //avoid [-Weffc++] warning
#if 0
    FBIO& operator=(FBIO& that)
    {
//debug("FBOP op=");
        m_scrinfo = that.m_scrinfo;
//xfr ownership of open data:
        m_fd = that.m_fd; that.m_fd = -1;
        m_dirty = that.m_dirty; that.m_dirty = false;
        sdl_window = that.sdl_window; that.sdl_window = 0;
        sdl_renderer = that.sdl_renderer; that.sdl_renderer = 0;
        sdl_texture = that.sdl_texture; that.sdl_texture = 0;
        m_pixels = that.m_pixels; that.m_pixels = 0;
        return *this;
    }
#endif //0
public: //properties
//    inline bool isRPi() const { return isRPi(); } //fexists("/boot/config.txt"); } //use IS_RPI macro instead?
    static inline bool isRPi() { return fexists("/boot/config.txt"); } //use __arm__ or __ARMEL__ macro instead?
    NAPI_EXPORT_PROPERTY(FBIO, isRPi);
    static inline bool isXWindows() { return (nvl(getenv("DISPLAY"))[0] == ':'); } //is XWindows running
    NAPI_EXPORT_PROPERTY(FBIO, isXWindows);
    inline bool dirty() const { return !!m_dirty; }
//TODO?    void dirty(int now_dirty) { m_dirty = now_dirty; } //custom dirty repaint
    inline void dirty(bool now_dirty) { m_dirty = now_dirty? 2: 0; } //compensate for double buffering?
    NAPI_EXPORT_PROPERTY(FBIO, dirty, dirty);
    inline bool isOpen() const { return ::isOpen(m_fd); }
    NAPI_EXPORT_PROPERTY(FBIO, isOpen);
    inline bool isValid() const { return m_scrinfo.isvalid; }
    NAPI_EXPORT_PROPERTY(FBIO, isValid);
//    NAPI_EXPORT_PROPERTY(FBIO, dirty, dirty);
//    using screeninfo_t = decltype(m_scrinfo);
    const screeninfo_t* scrinfo() const { return &m_scrinfo; }
//    inline bool isOpen() const { return (m_fd > 0); }
    inline int fb() const { /*debug("ret fb@ 0x%p %s %d, valid? %d, open? %d", this, m_which, m_scrinfo.fb, isValid(), isOpen())*/; return m_scrinfo.isvalid? m_scrinfo.fb: -1; }
//no    void openfb(int fb) { openfb(fb, true); }
//    NAPI_EXPORT_PROPERTY(FBIO, fb, openfb); //allow Javascript to select which fb
public: //expose props to Javascript
    inline auto fbdev() const { return m_scrinfo.fbdev; }
    NAPI_EXPORT_PROPERTY(FBIO, fbdev);
    inline auto xres() const { return scrv.xres; }
    NAPI_EXPORT_PROPERTY(FBIO, xres);
//    inline auto xleft() const { return scrv.left_margin; }
//    inline auto xsync() const { return scrv.hsync_len; }
//    inline auto xright() const { return scrv.right_margin; }
    inline auto xtotal() const { return scrv.xtotal(); }
    NAPI_EXPORT_PROPERTY(FBIO, xtotal);
    inline auto yres() const { return scrv.yres; }
    NAPI_EXPORT_PROPERTY(FBIO, yres);
//    inline auto yleft() const { return scrv.upper_margin; }
//    inline auto ysync() const { return scrv.vsync_len; }
//    inline auto yright() const { return scrv.lower_margin; }
    inline auto ytotal() const { return scrv.ytotal(); }
    NAPI_EXPORT_PROPERTY(FBIO, ytotal);
    int frtime() const { return scrv.frtime(); } //theoretical, usec
    NAPI_EXPORT_PROPERTY(FBIO, frtime);
    inline auto pixclock() const { return scrv.pixclock; }
    NAPI_EXPORT_PROPERTY(FBIO, pixclock);
//avoid conflict with measured fps
//    inline auto fps() const { return scrv.fps(); } //psec2KHz(scrv.pixclock); }
//    NAPI_EXPORT_PROPERTY(FBIO, fps);
//TODO: are these of interest to JavaScript? probably not
//fix: smem_start, smem_len, ywrapstep, line_length, mmio_start, mmio_len, accel, capabilities
//var: xres_virtual, yres_virtual, xoffset, yoffset, bits_per_pixel, red.*, green.*, blue.*, transp.*, height, width, accel_flags, sync
//    int xres, xsync, xfront, xback, yres, yfront, ysync, yback, fps, clock;
//    bool m_want_vis;
public: //methods
//convenience functions/simplified api for caller:
//    void openfb(int fb, bool want_errors)
//    typedef bool (*scrvfix_t)();
//        auto async_exec = [this]() -> bool { return wait4sync(); };
//    bool noovr() { return false; }
//    using scrvfixup_t = decltype(&FBIO::noovr);
//    inline void openfb(int fb, bool want_vis) { openfb(fb, want_vis, &FBIO::noovr); } //[]() { return false; }); }
//    template<class LAMBDA_T>
    void openfb(int fb, bool want_vis) //, /*LAMBDA_T*/ scrvfixup_t fixup) //scrvfix_t fixup) //allow caller to select which display device to use
    {
//debug("FBIO openfb(%d) this@ 0x%p %s", fb, this, m_which);
//        m_fb.~fbinfo_t(); //dtor
//        new (&m_fb) fbinfo_t(n); //re-init; placement new calls ctor again
//        close();
//        m_fb = n;
//        m_scrinfo.isvalid = false;
  //      snprintf(m_fbdev, sizeof(m_fbdev), "/dev/fb%u", n);
//        if (!fexists(fbdev(n))) return; //silently ignore non-existent devices
//        m_want_vis = want_vis;
        if (fb < 0) { new (&m_scrinfo) screeninfo_t(fb); return; } //no fb; init to empty
        open(fbdev(fb), want_vis? O_RDWR: O_RDONLY);
        if (!isOpen()) RETURN(errmsg("can't open fb#%d '%s'", m_scrinfo.fb, m_scrinfo.fbdev));
//        m_scrinfo.debug(want_vis? "fbio.openfb(vis)": "fbio.openfb(!vis)", SRCLINE);
//        auto async_exec = [this]() -> bool { return wait4sync(); };
//        const char* ovr = /*(fixup &&*/ (this->*fixup)()? " (override)": ""; //override scrv values
        debug("openfb fb%d '%s' fd %d: xres %'d + %'d+%'d+%'d = xtotal %'d, yres %'d + %'d+%'d+%'d = ytotal %'d, pixclock %'d psec (%'d KHz) => %3.1f fps, valid? %d, want_vis? %d, has txtr? %d", m_scrinfo.fb, m_scrinfo.fbdev, m_fd, scrv.xres, scrv.left_margin, scrv.hsync_len, scrv.right_margin, scrv.xtotal(), scrv.yres, scrv.upper_margin, scrv.vsync_len, scrv.lower_margin, scrv.ytotal(), scrv.pixclock, (int)psec2KHz(scrv.pixclock), scrv.fps(), m_scrinfo.isvalid, want_vis, !!sdl_texture);
//        close(fd);
    }
    inline int close() { debug("close(%d)? %d", m_fd, isOpen()); int retval = isOpen()? close(m_fd): -1; m_fd = -1; return retval; }
//#ifdef USING_NAPI
//    Napi::Value close_method(const Napi::CallbackInfo& info)
//    {
//        return Napi::Number::New(info.Env(), close());
//    }
//    NAPI_EXPORT_METHOD(FBIO, "close", close_method);
//#endif //def USING_NAPI
    inline bool wait4sync() //{ return wait4sync(m_fd); }
//    bool wait4sync(int fd)
    {
//TODO: detect overrun?
        int arg = 0; //must be 0
        return isOpen() && (ioctl(m_fd, FBIO_WAITFORVSYNC, &arg) >= 0);
//TODO? adaptive vsync, OMAPFB_WAITFORVSYNC_FRAME
//        static unsigned int arg = 0;
//        ioctl(fbdev, FBIO_WAITFORVSYNC, &arg);
    }
    inline bool wait4sync(usec_t fallback_usec) //{ return wait4sync(m_fd, fallback_msec); }
//    bool wait4sync(int fd, msec_t fallback_msec)
    {
        if (wait4sync()) return true;
//debug(RED_MSG "wait4sync failed");
        if (!fallback_usec) fallback_usec = 10e3; //wait >= 1 msec so CPU doesn't get too busy
        usleep(fallback_usec); //* 1e3); //kludge: try to maintain timing
        return false;
    }
//    inline int getline()
//    {
//        int counter;
//        return (isOpen() && ioctl(m_fd, OMAPFB_GET_LINE_STATUS, &counter))? counter: -1;
//    }
//get name of FB device:
    const char* fbdev(int fb)
    {
//        static char name[30];
        if ((fb != m_scrinfo.fb) || !m_scrinfo.isvalid)
        {
            m_scrinfo.fb = fb;
            snprintf(m_scrinfo.fbdev, sizeof(m_scrinfo.fbdev), "/dev/fb%u", fb);
            m_scrinfo.isvalid = false; //screen info no longer matches name
        }
        return m_scrinfo.fbdev;
    }
//show/hide window (dev only):
#if 0
    bool visible(bool want_vis)
    {
        if (!isOpen()) return false;
#ifdef HAS_SDL
        if (!isXWindows() || !sdl_window) return false;
        debug("visible: %d", want_vis);
        if (want_vis) (void)SDL_ShowWindow(sdl_window);
        else (void)SDL_HideWindow(sdl_window);
#endif //HAS_SDL
        return true;
    }
#endif //0
protected:
//os api helpers:
    template <typename ... ARGS>
    int open(const char* path, int flags, ARGS&& ... args)
    {
        const bool want_vis = (flags != O_RDONLY); //pseudo-param to control SDL window vis
        clear_error();
//debug("fb_open");
//        memset(&sdl_mode, 0, sizeof(sdl_mode)); //must be init before calling delegated ctor
//        debug("open '%s', flags 0x%x: isXWindows? %lu:0x%x, Disp '%s'", path, flags, sizeof(isXWindows()), (int)isXWindows(), nvl(getenv("DISPLAY"), "(none)")); //, sizeof(broken_CFG.isXWindows()));
//        if (!isXWindows())
//            memset(&sdl_mode, 0, sizeof(sdl_mode)); //kludge: init for !isXWindows() case
//        if (isOpen()) close(m_scrinfo.fd);
        close();
        dirty(false); //m_dirty = 0;
//        m_scrinfo.fb = -1;
//        strncpy(m_scrinfo.fbdev, sizeof(m_scrinfo.fbdev), path);
        m_fd = ::open(path, flags, std::forward<ARGS>(args) ...); //perfect forward
//        if (fd <= 0) return fd;
//        debug("opened '%s'? %d, scrinfo valid? %d, px clk %'d, txtr@ 0x%p", path, isOpen(), m_scrinfo.isvalid, scrv.pixclock, sdl_texture);
        if (!isOpen()) return m_fd; //might be err code so return it
        if (m_scrinfo.isvalid); //leave data as-is in case overridden by caller
        else if (ioctl(FBIOGET_FSCREENINFO, &scrf) < 0) errmsg("can't get fb fixed info");
        else if (ioctl(FBIOGET_VSCREENINFO, &scrv) < 0) errmsg("can't get fb var info");
        IF_SDL(else if (!scrv.pixclock && !get_canvas(want_vis)) errmsg("can't get fb canvas"));
        else if (!scrv.pixclock && !get_pixclock()) errmsg("can't get fb pixclock");
        else m_scrinfo.isvalid = true;
        if (want_vis) ::write(m_fd, CURSOFF, strlen(CURSOFF));
        IF_SDL(if (want_vis && !get_canvas(want_vis)) errmsg("can't get fb canvas"));
        IF_SDL(if (!want_vis) drop_canvas());
//        return FAKED_FD; //fake fd (success)
        return m_fd; //m_scrinfo.fd; //= fd;
    }
//public:
    int close(int& fd)
    {
        clear_error();
        if (!::isOpen(fd)) return EBADFD; //E_NOTOPEN;
        IF_SDL(drop_canvas());
        ::write(m_fd, CURSON, strlen(CURSON));
        int svfd = fd;
        fd = -1; //mark it closed for caller
        if (m_fd == fd) m_fd = -1;
        return ::close(svfd);
    }
    inline int ioctl(int cmd, void* data) { return ioctl(m_fd, cmd, data); }
    int ioctl(int fd, int cmd, void* data)
    {
        clear_error();
//        if (!isXWindows()) return ::ioctl(fd, cmd, data);
#ifdef HAS_SDL
//        static int count = 0;
//        if (count++ < 5) debug("fake ioctl(cmd 0x%x)", cmd);
//        if (fd != FAKED_FD) return errmsg(-1, "unknown ioctl file: %d (wanted FB %d)", fd, FAKED_FD);
      if (isXWindows())
        switch (cmd)
        {
//TODO?
//FBIOPAN_DISPLAY, FBIOPUT_VSCREENINFO (clears fb)
//OMAPFB_GET_LINE_STATUS
//OMAPFB_WAITFORVSYNC_FRAME
//https://github.com/raspberrypi/linux/blob/rpi-3.2.27/drivers/video/bcm2708_fb.c
//https://github.com/rst-/raspberry-compote/blob/master/fb/fbtestXI.c
//https://www.raspberrypi.org/forums/viewtopic.php?t=19073
#if 1 //XWindows doesn't allow this one so fall back to SDL:
            case FBIO_WAITFORVSYNC:
            {
                if (!sdl_renderer) return errmsg(-1, "no renderer");
                if (!sdl_texture) return errmsg(-1, "no texture");
                if (!SDL_OK(SDL_RenderClear(sdl_renderer), "SDL_RenderClear")) return -1; //SDL wiki says to do this even if all pixels will be updated
//                if (!SDL_OK(SDL_RenderDrawPoint(sdl_renderer, 0, 0), "SDL draw pt")) return -1; //kludge: force RenderPresent to update screen
//                static int count = 0; ++count;
//                if (count++ > 100) fatal("enough");
//                const SDL_Rect& EntireRect = *NULL_OF(SDL_Rect); //NULL; //src + dest rect
//printf(m_dirty? "D%d ": "c%d ", m_dirty);
#if 1 //flush pixel data
                if (/*sdl_texture &&*/ m_dirty) //CAUTION: dirty needs to be on for 2 refreshes (due to double buffering?)
                {
                    if (!m_pixels) return errmsg(-1, "no pixel buf");
//if (count < 10) errmsg(PINK_MSG "SDL_UpdateTexture, SDL_RenderClear, SDL_RenderCopy");
                    /*if (dirty)*/ if (!SDL_OK(SDL_UpdateTexture(sdl_texture, ENTIRE_RECT, m_pixels, scrv.xres * sizeof(m_pixels[0])), "SDL_UpdateTexture row len %'lu", scrv.xres * sizeof(m_pixels[0]))) return -1;
//                    if (!SDL_OK(SDL_RenderCopy(sdl_renderer, sdl_texture, ENTIRE_RECT, ENTIRE_RECT), "SDL_RenderCopy")) return -1;
//                static int lastTime = 0; //limit refresh rate (doesn't prevent tearing)
//                static int freq = 3; //example speed value
//#define TICKS_FOR_NEXT_FRAME (1000 / 60)
//        while (lastTime - SDL_GetTicks() < TICKS_FOR_NEXT_FRAME) SDL_Delay(1);
//                int now = //SDL_GetTicks();
//                    SDL_GetPerformanceCounter() / SDL_GetPerformanceFrequency();
//                float delta_time = (now - lastTime) * (float)freq;
//        new_pos = old_pos + speed * delta_time;
//        if (dirty)
                    --m_dirty; //= false;
                }
#endif //1
//NOTE: RenderPresent doesn't seem to do anything unless something was updated
                if (!SDL_OK(SDL_RenderCopy(sdl_renderer, sdl_texture, ENTIRE_RECT, ENTIRE_RECT), "SDL_RenderCopy")) return -1;
//if (count++ < 10) debug(PINK_MSG "SDL_RenderPresent");
                (void)SDL_RenderPresent(sdl_renderer); //waits for VSYNC
//                lastTime = //SDL_GetTicks();
//                    SDL_GetPerformanceCounter() / SDL_GetPerformanceFrequency();
                return 0; //success
            }
#endif //1
#if 0 //XWindows allows these so just pass thru to ::ioctl()
            case FBIOGET_VSCREENINFO:
            {
                *(struct fb_var_screeninfo*)data = scrv;
                return 0; //success
            }
            case FBIOGET_FSCREENINFO:
            {
//                struct fb_fix_screeninfo* fp = (struct fb_fix_screeninfo*)data;
//                memset(fp, 0, sizeof(*fp));
//                fp->line_length = sdl_mode.w * sizeof(m_pixels[0]);
//                fp->smem_len = sdl_mode.h * fp->line_length; //= sdl_mode.w * sizeof(m_pixels[0]);
//	char id[16];			/* identification string eg "TT Builtin" */
//	unsigned long smem_start;	/* Start of frame buffer mem (physical address) */
//	__u32 type;			/* see FB_TYPE_*		*/
//	__u32 type_aux;			/* Interleave for interleaved Planes */
//	__u32 visual;			/* see FB_VISUAL_*		*/
//	__u16 xpanstep;			/* zero if no hardware panning  */
//	__u16 ypanstep;			/* zero if no hardware panning  */
//	__u16 ywrapstep;		/* zero if no hardware ywrap    */
//	unsigned long mmio_start;	/* Start of Memory Mapped I/O (physical address) */
//	__u32 mmio_len;			/* Length of Memory Mapped I/O  */
//	__u32 accel;			/* Indicate to driver which	specific chip/card we have	*/
//	__u16 capabilities;		/* see FB_CAP_*			*/
//	__u16 reserved[2];	
                *(struct fb_fix_screeninfo*)data = scrf;
                return 0; //success
            }
            default:
                return errmsg(-1, "unknown ioctl cmd: 0x%x (wanted 0x%x, 0x%x or 0x%x)", cmd, FBIOGET_VSCREENINFO, FBIOGET_FSCREENINFO, FBIO_WAITFORVSYNC);
#endif //0
        }
#endif //HAS_SDL
        int retval = ::ioctl(fd, cmd, data);
#if 1 //kludge: FBIOPUT_VSCREENINFO !worky so help it out a little:
        using scrv_t = decltype(m_scrinfo.var); //std::remove_cvref<decltype(scrv)>::type;
        static std::vector<scrv_t /*decltype(m_scrinfo.var)*/> m_overrides;
        switch (cmd)
        {
            case FBIOPUT_VSCREENINFO:
                debug("save override[%lu]", m_overrides.size());
                m_overrides.push_back(*(scrv_t*)data);
                break;
            case FBIOGET_VSCREENINFO:
                for (auto it = m_overrides.begin(); it != m_overrides.end(); ++it)
                    if (it->match(*(scrv_t*)data))
                    {
                        debug("apply override[%lu/%lu]", it - m_overrides.begin(), m_overrides.size());
                        *(scrv_t*)data = *it;
                    }
                break;
        }
#endif //1
        return retval;
    }
    void* mmap(void* addr, size_t len, int prot, int flags, int ofs) { return mmap(addr, len, prot, flags, m_fd, ofs); }
    void* mmap(void* addr, size_t len, int prot, int flags, int fd, int ofs)
    {
        clear_error();
//        using rettype = uint8_t*; //void*; //needs size
//        if (!isXWindows()) return mmap(addr, len, prot, flags, fd, ofs);
#ifdef HAS_SDL
//        if (fd != FAKED_FD) return errmsg(MAP_FAILED, "unknown mmap file: %d (wanted FB %d)", fd, FAKED_FD);
        if (isXWindows())
        {
            if (m_pixels) return errmsg(m_pixels, "memory leak");
            m_pixels = 0;
//no!            sdl_texture = 0;
            size_t numpx = scrv.xres * scrv.yres; // * sizeof(m_pixels[0]);
            static_assert(sizeof(m_pixels[0]) == 4, "bad pixel bad size");
            if (prot != (PROT_READ | PROT_WRITE)) return errmsg(MAP_FAILED, "unknown mmap prot: 0x%x (expected 0x%x)", prot, PROT_READ | PROT_WRITE);
            if (flags != MAP_SHARED) return errmsg(MAP_FAILED, "unknown flags: 0x%x (expected 0x%x)", flags, MAP_SHARED);
//TODO: let caller do it?
            if (len != numpx * sizeof(m_pixels[0])) return errmsg(MAP_FAILED, "mmap wrong length: %'d (expected %'d)", len, numpx * sizeof(m_pixels[0]));
#ifdef LAZY_TEXTURE
            constexpr int acc = SDL_TEXTUREACCESS_STATIC; //_STREAM?; //don't need to lock if using separate pixel array + VSYNC?
//errmsg(PINK_MSG "SDL_CreateTexture");
//SDL_RendererInfo rinfo;
//if (!SDL_OK(SDL_GetRendererInfo(sdl_renderer, &rinfo))) return errmsg(MAP_FAILED, "SDL_GetRendererInfo %p", sdl_renderer);
//debug("renderer %p: '%s', flag 0x%x, #fmts %d, maxw %'d, maxh %'d", sdl_renderer, rinfo.name, rinfo.flags, rinfo.num_texture_formats, rinfo.max_texture_width, rinfo.max_texture_height);
//Uint32[16] rinfo.texture_formats
            if (!SDL_OK(sdl_texture = SDL_CreateTexture(sdl_renderer, SDL_PIXELFORMAT_ARGB8888, acc, scrv.xres, scrv.yres), "SDL_CreateTexture %'d x %'d", scrv.xres, scrv.yres)) return MAP_FAILED;
#endif //def LAZY_TEXTURE
            m_pixels = new uint32_t[numpx];
            if (!m_pixels) return errmsg(MAP_FAILED, "alloc pixel buf(%'d)", numpx);
            memset(m_pixels, 0, numpx * sizeof(m_pixels[0]));
            dirty(true); //repaint first time; TODO: read current screen + set false?
            return m_pixels;
        }
#endif //HAS_SDL
        return ::mmap(addr, len, prot, flags, fd, ofs);
    }
    int munmap(size_t len) { return munmap(m_pixels, len); }
    int munmap(void* addr, size_t len)
    {
        clear_error();
//        if (!cfg.isXWindows()) return munmap(addr, len);
#ifdef HAS_SDL
        if (isXWindows())
        {
            size_t numpx = scrv.xres * scrv.yres; // * sizeof(m_pixels[0]);
            if (addr != m_pixels) return errmsg(-1, "unknown munmap addr@: 0x%p (expected FB@ 0x%p)", addr, m_pixels);
            if (len != numpx * sizeof(m_pixels[0])) return errmsg(-1, "munmap wrong length: %'d (expected %'d)", len, numpx * sizeof(m_pixels[0]));
            if (m_pixels) delete[] m_pixels;
            m_pixels = 0; //dirty(false);
#ifdef LAZY_TEXTURE
          if (sdl_texture) SDL_DestroyTexture(sdl_texture);
          sdl_texture = 0;
#endif //def LAZY_TEXTURE
          return 0; //success
        }
#endif //HAS_SDL
        return ::munmap(addr, len);
    }
private: //helpers
//    pixclock_t m_pxclk_cache[4] = {0};
//kludge: ioctl doesn't want to tell us pixclock, so just measure it
    inline pixclock_t get_pixclock() { return get_pixclock(m_fd); }
    pixclock_t get_pixclock(int fd) //no-kHz, psec
    {
//CAUTION: minimize timing override at this level; used here only to get px clock if !available elsewhere
//        int clk_ovr = cfg.timing()[0]? psec2KHz(cfg.pixclock()): 0; //psec / 1e3: 0;
//        int rr = sdl_mode.refresh_rate? sdl_mode.refresh_rate: 60; //Hz
//        int retval = 1e12 / (rr * sdl_mode.w * sdl_mode.h); //psec
//debug("get px clk: ref rate %'d, w %'d, h %'d => px clk %'d KHz (%'d psec), override %'d KHz (%'d psec)", sdl_mode.refresh_rate, sdl_mode.w, sdl_mode.h, psec2KHz(retval), retval, psec2KHz(clk_ovr), clk_ovr);
//        return clk_ovr? clk_ovr: retval? retval: psec2KHz(19.2e3); //assume VGA (19.2MHz) if SDL doesn't know
        if (scrv.pixclock) return scrv.pixclock;
//        IF_SDL(if (!get_canvas()) errmsg("can't get fb canvas"));
//        int cache_slot = clamp(m_info.fb, SIZEOF(m_pxclk_cache) - 1);
//        if ((m_info.fb >= 0) && (m_info.fb < SIZEOF(pxclk_cache)))
//        if ((cache_slot == m_info.fb) && m_pxclk_cache[cache_slot])
//            return m_info.var.pixclock = m_pxclk_cache[cache_slot];
        int frames = 0;
//        struct timeval start, finish; //timeval;
//        debug("measuring fb#%d pixclock ...", m_info.fb);
        if (!wait4sync(fd)) return 0; //wait until start of next frame
        const usec_t started = now_usec();
//        const msec_t st_m = now_msec();
//        if (gettimeofday(&start, 0)) return 0; //fatal("gettimeofday 0x%p", &tz);
//        long elapsed = -(timeval.tv_sec * 1e6 + timeval.tv_usec); //usec
        static constexpr int NUMFR = 40; //CAUTION: elapsed time must stay under ~ 2 sec to avoid overflow; 40 frames @60Hz ~= 667K, @30Hz ~= 1.3M, @20Hz == 2M usec
        while (frames++ < NUMFR) if (!wait4sync(fd)) return 0;
//        if (gettimeofday(&finish, 0)) return 0; //fatal("gettimeofday 0x%p", &tz);
//        elapsed += timeval.tv_sec * 1e6 + timeval.tv_usec; //usec
//        unsigned long elapsed = (finish.tv_sec - start.tv_sec) * 1e6 + finish.tv_usec - start.tv_usec; //usec
        usec_t elapsed = now_usec() - started;
//        msec_t el_m = now_msec() - st_m;
//CAUTION: avoid overflow by ordering ops to stay within valid range
//elapsed <= 2M usec * 1e3 == 2e9; stays within uint32 limit
//then / ~500..2000 * 1e3 ~= 4e9; still within uin32 limit, but getting close to overflow!
//then / ~400..1000 / 40 ~= 2e6; very safe range
        pixclock_t pxclk = elapsed * 1e3 / scrv.xtotal() * 1e3 / scrv.ytotal() / --frames; //psec
//        if ((unsigned long)-1 / frames . elapsed * 1e3 / scrv.xtotal() * 1e3 )
//        debug("measured fb#%d pixclock: %'d frames (%'d x %'d) / %'u usec => %'u psec (%'u KHz) pix clock", m_scrinfo.fb, frames, scrv.xtotal(), scrv.ytotal(), elapsed, pxclk, psec2KHz(pxclk));
        static const pixclock_t lowest = /*psec2KHz*/(2e3), highest = /*psec2KHz*/(200e3);
//        static const pixclock_t lowest = psec2KHz(2e3), highest = psec2KHz(200e3);
//        if ((psec2KHz(pxclk) < lowest) || (psec2KHz(pxclk) > highest)) /*return*/ errmsg("pxclk %'u psec (%'u KHz) probably wrong; outside expected range %'u .. %'u KHz", pxclk, psec2KHz(pxclk), lowest, highest);
        if ((pxclk < lowest) || (pxclk > highest)) /*return*/ errmsg("pxclk %'u psec (%'u KHz) probably wrong; outside expected range %'u .. %'u psec (%'u .. %'u KHz)", pxclk, psec2KHz(pxclk), lowest, highest, psec2KHz(lowest), psec2KHz(highest));
//        return m_pxclk_cache[cache_slot] = m_info.var.pixclock;
//40 frames x 1,366 xtotal x 768 ytotal / 474,793 usec => 11 psec pix clock 
//40 frames x 1,366 xtotal x 768 ytotal / 599,198 usec => 14 psec pix clock 
        return scrv.pixclock = pxclk;
    }
//#else //def HAS_SDL
//    FBIO(): sdl_texture({0}), m_pixels(0), m_dirty(0)
//    PERFWD(fb_open, ::open);
//    PERFWD(fb_mmap, ::mmap);
//    PERFWD(fb_ioctl, ::ioctl);
//    PERFWD(fb_munmap, ::munmap);
//    PERFWD(fb_close, ::close);
//    int fb_get_pxclk() const { return 19.2e3; } //TODO
//#endif //def HAS_SDL
//    NAPI_STOP_EXPORTS(FBIO); //public
#ifdef HAS_SDL
//SDL helpers:
//emulate FB memory using SDL window
    bool get_canvas(bool want_vis)
    {
        if (sdl_window) return true;
        sdl_window = 0;
        sdl_renderer = 0;
        if (!isXWindows()) return true;
//        debug("!try sdl? 0x%x ... using SDL on XW", !CFG.isXWindows());
        if (!SDL_OK(SDL_Init(SDL_INIT_VIDEO), "SDL_Init video")) return false;
        if (!SDL_OK(SDL_SetHint(SDL_HINT_RENDER_VSYNC, "1"), "SDL_SetHint VSYNC")) return false; //use video sync to avoid tear
        if (!SDL_OK(SDL_SetHint(SDL_HINT_RENDER_DRIVER, "RPI"), "SDL_SetHint RPI")) return false; //in case RPI is not first on list
        int dispinx = 0; //default first screen (for XWindows only)
        sscanf(nvl(getenv("DISPLAY"), ":0"), ":%d", &dispinx); //use current display
#if 0 //debug info
        debug("#disp: %d, #modes: %d", SDL_GetNumVideoDisplays(), SDL_GetNumDisplayModes(dispinx));
        for (int i = 0, limit = SDL_GetNumVideoDrivers(); i < limit; ++i)
            debug("video driver[%d/%d]: '%s'", i, limit, SDL_GetVideoDriver(i));
        SDL_Rect r = {0};
        if (!SDL_OK(SDL_GetDisplayBounds(0, &r), "SDL_GetDisplayBounds")) return false;
        debug("disp rect: (%'d, %'d), (%'d, %'d)", r.x, r.y, r.w, r.h);
#endif
        SDL_DisplayMode sdl_mode;
        if (!SDL_OK(SDL_GetCurrentDisplayMode(dispinx, &sdl_mode), "SDL_GetDisplayMode [%d]", dispinx)) return false;
        debug("video drvr '%s', fmt %s, disp %'d x %'d vs. screen %'d x %'d", nvl(SDL_GetCurrentVideoDriver(), "(none)"), PixelFormat(sdl_mode.format), sdl_mode.w, sdl_mode.h, scrv.xres, scrv.yres); //should match "tvservice -s"
//        decltype(m_scrinfo.var)& vs = m_scrinfo.var; //reduce verbosity
        switch (/*SDL_BITSPERPIXEL*/(sdl_mode.format))
        {
            case SDL_PIXELFORMAT_RGB888:
            case SDL_PIXELFORMAT_ARGB8888:
                scrv.transp.length = scrv.red.length = scrv.green.length = scrv.blue.length = 8;
                scrv.transp.offset = 24; scrv.red.offset = 16; scrv.green.offset = 8; scrv.blue.offset = 0;
                if (SDL_BITSPERPIXEL(sdl_mode.format) < 32) scrv.transp.length = 0;
//  m_info.var.left_margin + m_info.var.xres + m_info.var.right_margin + m_info.var.hsync_len;
//  m_info.var.upper_margin + m_info.var.yres + m_info.var.lower_margin + m_info.var.vsync_len;
// ->var.red.length, scrinfo->var.red.offset, scrinfo->var.red.msb_right,
// ->var.green.length, scrinfo->var.green.offset, scrinfo->var.green.msb_right,
// ->var.blue.length, scrinfo->var.blue.offset, scrinfo->var.blue.msb_right,
// ->var.transp.length, scrinfo->var.transp.offset, scrinfo->var.transp.msb_right,
// ->var.xoffset, scrinfo->var.yoffset);
                break;
//TODO: other formats?
            default:
                errmsg("unsupported pixel format: %s (%0x)", PixelFormat(sdl_mode.format), sdl_mode.format);
                return false;
        }
//for XWindows (dev), use upper right part of screen; else use entire screen
//kludge: RenderPresent !worky with hidden window, so create small (10 x 10) window
        const int W = want_vis? MIN(scrv.xres, sdl_mode.w): 10; //DONT_CARE;
        const int H = want_vis? MIN(scrv.yres, sdl_mode.h): 10; //DONT_CARE;
        const int X = (scrv.xres - W) * 9/10; //SDL_WINDOWPOS_UNDEFINED(dispinx);
        const int Y = (scrv.yres - H) * 9/10; //SDL_WINDOWPOS_UNDEFINED(dispinx);
        const bool vis = true; //false; //RenderPresent (needed for get_pixclock) !worky when hidden :(
        const int wflags = (vis? SDL_WINDOW_SHOWN: SDL_WINDOW_HIDDEN) | SDL_WINDOW_RESIZABLE; // | SDL_WINDOW_FULLSCREEN_DESKTOP | SDL_WINDOW_OPENGL; //start hidden, caller can show later; resizable only for dev/debug purposes
        const int rflags = SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC; //use SDL_RENDERER_PRESENTVSYNC to get precise refresh timing
#if 0 //no way to set Vsync or title?
        if (!SDL_OK(SDL_CreateWindowAndRenderer(W, H, wflags, &sdl_window, &sdl_renderer), "SDL_CreateWindowAndRenderer")) return false;
#else
        if (!SDL_OK(sdl_window = SDL_CreateWindow("GpuPort", X, Y, W, H, wflags), "SDL_CreateWindow")) return false;
        if (!SDL_OK(sdl_renderer = SDL_CreateRenderer(sdl_window, FIRST_RENDERER_MATCH, rflags), "SDL_CreateRenderer")) return false;
//SDL_Renderer* SDL_GetRenderer(SDL_Window* window)
#endif //0
        (void)SDL_GetWindowSize(sdl_window, &sdl_mode.w, &sdl_mode.h); //in case didn't get requested size
        char title[100];
        snprintf(title, sizeof(title), "GPU %'d x %'d", sdl_mode.w, sdl_mode.h);
        if (want_vis)
        {
            if ((sdl_mode.w != scrv.xres) || (sdl_mode.h != scrv.yres))
            {
                debug(RED_MSG "CAUTION: SDL window size %'d x %'d != screen size %'d x %'d", sdl_mode.w, sdl_mode.h, scrv.xres, scrv.yres);
                snprintf(title + strlen(title), sizeof(title) - strlen(title), " (not %'d x %'d)", scrv.xres, scrv.yres);
            }
//override FB info with SDL info:
            scrv.xres = sdl_mode.w;
            scrv.yres = sdl_mode.h;
            scrf.smem_len = sdl_mode.h * (scrf.line_length = sdl_mode.w * sizeof(m_pixels[0]));
        }
        (void)SDL_SetWindowTitle(sdl_window, title);
        scrv.bits_per_pixel = SDL_BITSPERPIXEL(sdl_mode.format);
        debug("window@ 0x%p: title '%s', fmt %s, %'d x %'d", sdl_window, title, PixelFormat(sdl_mode.format), sdl_mode.w, sdl_mode.h);
//        const char* fmt = SDL_GetPixelFormatName(sdl_mode.format);
//debug("cur disp mode: %d bpp, %s %'d x %'d", SDL_BITSPERPIXEL(sdl_mode.format), SDL_GetPixelFormatName(sdl_mode.format), sdl_mode.w, sdl_mode.h); //should match "tvservice -s"
//                debug("ioctl: get var info, %'d x %'d, %d bpp %s", vp->xres, vp->yres, vp->bits_per_pixel, fmt);
//errmsg(PINK_MSG "SDL_CreateWindowAndRenderer");
        SDL_RendererInfo rinfo;
        if (!SDL_OK(SDL_GetRendererInfo(sdl_renderer, &rinfo), "SDL_GetRendererInfo@ 0x%p", sdl_renderer)) return false;
        std::string fmts;
        for (int i = 0; i < rinfo.num_texture_formats; ++i)
            fmts += PixelFormat(rinfo.texture_formats[i], ";");
        if (!fmts.length()) fmts += ";none";
        debug("renderer@ 0x%p: name '%s', max %'d x %'d, flags %s (0x%x), %d fmts: %s", sdl_renderer, rinfo.name, rinfo.max_texture_width, rinfo.max_texture_height, RendererFlags(rinfo.flags), rinfo.flags, rinfo.num_texture_formats, fmts.c_str() + 1);
#ifndef LAZY_TEXTURE
//don't need texture until caller uses pixels: -wrong, need it for get_pixclock also?
        constexpr int acc = SDL_TEXTUREACCESS_STATIC; //_STREAM?; //don't need to lock if using separate pixel array + VSYNC?
//errmsg(PINK_MSG "SDL_CreateTexture");
        if (!SDL_OK(sdl_texture = SDL_CreateTexture(sdl_renderer, SDL_PIXELFORMAT_ARGB8888, acc, scrv.xres, scrv.yres), "SDL_CreateTexture %'d x %'d", scrv.xres, scrv.yres)) return MAP_FAILED;
#endif //ndef LAZY_TEXTURE
//        debug("sdl wnd opened %'d x %'d", sdl_mode.w, sdl_mode.h);
//draw first time in case caller doesn't update for a while:
//errmsg(PINK_MSG "SDL_SetRenderDrawColor, SDL_RenderClear, SDL_RenderPresent");
//        constexpr uint32_t color = 0xFF800080; //BLACK;
//debug("initialize window to 0x%x = r x%x, g x%x, b x%x, a x%x", color, R_G_B_A(color));
//        if (!SDL_OK(SDL_SetRenderDrawColor(sdl_renderer, R_G_B_A(color)))) return errmsg("SDL_SetRenderDrawColor");
//        if (!SDL_OK(SDL_RenderClear(sdl_renderer))) return errmsg("SDL_RenderClear");
////        SDL_SetRenderDrawColor(renderer, 255, 0, 0, 255);
//        (void)SDL_RenderPresent(sdl_renderer); //repaint screen; waits for VSYNC
        pxclear(::BLACK);
        return true;
    }
    void drop_canvas()
    {
        if (!isXWindows()) return;
//        if (fd != FAKED_FD) return errmsg(-1, "unknown close file: %d (wanted FB %d)", fd, FAKED_FD);
#ifndef LAZY_TEXTURE
        if (sdl_texture) SDL_DestroyTexture(sdl_texture);
        sdl_texture = 0;
#endif //ndef LAZY_TEXTURE
        if (sdl_renderer) SDL_DestroyRenderer(sdl_renderer);
        if (sdl_window) SDL_DestroyWindow(sdl_window);
        sdl_renderer = 0;
        sdl_window = 0;
        SDL_Quit();
    }
//fill with color:
//NOTE: direct to texture (does not affect pixel array)
//#if 1 //broken: flickers back and forth when in wait loop
//private:
    int pxclear(uint32_t ext_color)
    {
        clear_error();
//debug("clear window 0x%x = r x%x, g x%x, b x%x, a x%x", ext_color, R_G_B_A(ext_color));
        if (!sdl_renderer) return errmsg("no renderer");
        if (!SDL_OK(SDL_SetRenderDrawColor(sdl_renderer, R_G_B_A(ext_color)), "SDL_SetRenderDrawColor")) return SDL_NotOK;
        if (!SDL_OK(SDL_RenderClear(sdl_renderer), "SDL_RenderClear")) return SDL_NotOK;
        (void)SDL_RenderPresent(sdl_renderer); //repaint screen; waits for VSYNC
        return SDL_Success; //success
    }
    static const char* PixelFormat(Uint32 fmt, const char* delim = "")
    {
//        static std::string fmt_desc;
        static char fmt_desc[30];
        const char* prefix = "SDL_PIXELFORMAT_";
        const char* name = SDL_GetPixelFormatName(fmt);
        if (!strncmp(name, prefix, strlen(prefix))) name += strlen(prefix); //reduce verbosity
//val = SDL_PIXELFORMAT_UNKNOWN;
//        fmt_desc = SDL_BITSPERPIXEL(fmt);
//        fmt_desc += " bpp ";
//        fmt_desc += name;
//        return fmt_desc.c_str();
        snprintf(fmt_desc, sizeof(fmt_desc), "%s%d bpp %s", delim, SDL_BITSPERPIXEL(fmt), name);
        return fmt_desc;
    }
    static const char* RendererFlags(Uint32 flags)
    {
        static std::string flag_desc;
        static const std::map<SDL_RendererFlags, const char*> SDL_RendererFlagNames =
        {
            {SDL_RENDERER_SOFTWARE, ";SW"}, //0x01
            {SDL_RENDERER_ACCELERATED, ";ACCEL"}, //0x02
            {SDL_RENDERER_PRESENTVSYNC, ";VSYNC"}, //0x04
            {SDL_RENDERER_TARGETTEXTURE, ";TOTXR"}, //0x08
        };
        char buf[30];
        flag_desc = "";
        for (const auto& pair: SDL_RendererFlagNames)
            if (flags & pair.first) { flag_desc += pair.second; flags &= ~pair.first; }
        if (flags) { snprintf(buf, sizeof(buf), ";??0x%x??", flags); flag_desc += buf; }
        if (!flag_desc.length()) flag_desc += ";none";
        return flag_desc.c_str() + 1;
//        static std::string rflags;
//        rflags = "";
//        if (flags & SDL_RENDERER_SOFTWARE) rflags += ", SOFTWARE"; //", SDL_RENDERER_SOFTWARE";
//        if (flags & SDL_RENDERER_ACCELERATED) rflags += ", ACCELERATED"; //", SDL_RENDERER_ACCELERATED";
//        if (flags & SDL_RENDERER_PRESENTVSYNC) rflags += ", PRESENTVSYNC"; //", SDL_RENDERER_PRESENTVSYNC";
//        if (flags & SDL_RENDERER_TARGETTEXTURE) rflags += ", TARGETTEXTURE"; //", SDL_RENDERER_TARGETTEXTURE";
//        if (!rflags.length()) rflags += ", ??";
//        return rflags.c_str() + 2;
//        {~(SDL_RENDERER_SOFTWARE | SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC | SDL_RENDERER_TARGETTEXTURE), "????"},
    }
#endif //HAS_SDL
    NAPI_STOP_EXPORTS(FBIO); //public
};
//CAUTION: doesn't work on RPi unless initialized outside FBIO
//#if 1
// /*static*/ const /*bool*/int FBIO::CFG.isXWindows = (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
//const int FBIO::CFG.isRPi = fexists("/boot/config.txt");
//#endif


///////////////////////////////////////////////////////////////////////////////
////
/// config
//

#include <cstdio> //fileno()
#include <string>
#include <unistd.h> //isatty()
#include <cstdio> //sscanf
#include <regex>


class CFG: public FBIO
{
    using SUPER = FBIO;
    NAPI_START_EXPORTS(CFG, FBIO);
//these won't change so set them once:
//    bool m_noGUI = isatty(fileno(stdin)); //https://stackoverflow.com/questions/13204177/how-to-find-out-if-running-from-terminal-or-gui
//DRY    const bool CFG.isXWindows = !!getenv("DISPLAY");
//    bool m_isXWindows = (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
//DRY: do these in Node.js addon rather than in Javascript
//    bool m_isXTerm = !!getenv("TERM");
//    bool m_isSSH = !!getenv("SSH_CLIENT");
//    bool m_isRPi = fexists("/boot/config.txt");
//    std::string m_dev;
//public:
//    using screeninfo_t = decltype(m_info);
//    using pixclock_t = decltype(m_info.var.pixclock);
//    pixclock_t get_pixclock(int fd); //fwd def
//allow caller to override some timing params (for dev/debug):
//    struct fbinfo_t
//    {
//    int m_fb;
//    char m_fbdev[30];
//        static FBIO io;
//        fbinfo_t(int n): fb(n), fd(-1) { snprintf(fbdev, sizeof(fbdev), "/dev/fb%u", n); }
//        ~fbinfo_t() { if (isOpen() io.close(fd); fd = -1; }
//        bool isOpen() const { return (fd >= 0); }
//        template <typename ... ARGS>
//        int open(ARGS&& ... args) //keep track of open fb
//        {
//            return fd = io.open(std::forward<ARGS>(args) ...); //perfect forward
//        }
//    } m_fb;
//    using fbinfo_t = decltype(m_fb);
    std::string m_timing; //persistent storage so caller can reuse buffer
//    decltype(m_scrinfo.var)& vs = m_scrinfo.var; //reduce verbosity
#if 0
private: //ctor/dtor; private to prevent multiple instances
#else
public:
#endif
//    std::string m_dpi, m_hdmi;
//    std::remove_cvref<decltype(scrv)>::type m_dpi, m_hdmi;
//    auto scrv_override = [this]() -> bool
//    bool scrv_override()
//    {
//        bool override = false;
//        if (scrv.match(m_dpi)) { scrv = m_dpi; override = true; }
//        if (scrv.match(m_hdmi)) { scrv = m_hdmi; override = true; }
//        return override;
//    };
//    CFG() { timing(shell("vcgencmd hdmi_timings")); } //debug("CFG ctor"); } //ls .")); //get RPi timing
    CFG(): m_timing("") //: m_dpi(-1), m_hdmi(-1) //: FBIO("cfg") //: m_fd(-1)
    {
        DebugScope ds("CFG::CFG");
//check timer accuracy:
        static int count = 0;
        usec_t started = now_usec();
        usleep(100e3);
        debug("calibration[%d]: sleep(100 msec) => %'d usec", count++, now_usec() - started);
        if (count > 1) throw "huh?";
//try to find a valid framebuffer:
//start at highest (assume dpi > hdmi/console)
        static const int MAX_FB = 4;
        for (int fb = MAX_FB -1; fb >= 1 -1; --fb)
        {
            if (fb && !fexists(fbdev(fb))) continue; //silently ignore non-existent devices
            openfb(fb); //, false); //hidden until caller decides to open
            if (m_scrinfo.isvalid) break;
        }
//try to get detailed timing (RPi only):
        if (isRPi())
        {
            timing_update(shell("vcgencmd hdmi_timings")); //m_hdmi = scrv;
            timing_update(shell("vcgencmd get_config dpi_timings")); //m_dpi = scrv;
        }
        m_all.push_back(this);
    }
    ~CFG()
    {
        DebugScope ds("CFG::~CFG");
//debug("CFG dtor");
        close();
        for (auto it = m_all.begin(); it != m_all.end(); ++it)
            if (*it == this) { m_all.erase(it); break; }
    }
public: //singleton:
    static std::vector<CFG*> m_all;
//CFG& cfg()
//{
//    static CFG m_cfg;
//    return m_cfg;
//}
    static inline CFG& any() { return *m_all.back(); }
#ifndef USING_NAPI
    template <typename ... ARGS>
    inline static CFG*& singleton(ARGS&& ... args)
    {
        static CFG* m_singleton = /*SUPER::singleton() =*/ new CFG(std::forward<ARGS>(args) ...); //first time only; CAUTION: override base singleton also
        return m_singleton;
    }
#endif
//  static void* operator new(size_t sz) { void* m = malloc(sz); return m; }
//  static void operator delete(void* m) { free(m); }
//helpers:
//    inline bool isOpen() const { return (m_fd >= 0); }
//    inline int close() { return isOpen(m_fd)? SUPER::close(m_fd): E_NOTOPEN; }
public: //properties
//read-only properties:
    inline bool noGUI() const { return isatty(fileno(stdin)); } //https://stackoverflow.com/questions/13204177/how-to-find-out-if-running-from-terminal-or-gui
    NAPI_EXPORT_PROPERTY(CFG, noGUI);
//    inline bool isXWindows() const { return isXWindows(); } //(nvl(getenv("DISPLAY"))[0] == ':'); } //is XWindows running
//    NAPI_EXPORT_PROPERTY(CFG, isXWindows);
    inline bool isXTerm() const { return !!getenv("TERM"); }
    NAPI_EXPORT_PROPERTY(CFG, isXTerm);
    inline bool isSSH() const { return !!getenv("SSH_CLIENT"); }
    NAPI_EXPORT_PROPERTY(CFG, isSSH);
//get RPi board rev level:
//http://www.mosaic-industries.com/embedded-systems/microcontroller-projects/raspberry-pi/gpio-pin-electrical-specifications
    const char* rev() const
    {
        static const std::regex hw_re("(?:^|\\n)\\s*Hardware\\s*:\\s*([^\\n]+)(?:\\n|$)");
        static const std::regex rev_re("(?:^|\\n)\\s*Revision\\s*:\\s*([^\\n]+)(?:\\n|$)");
        static const std::regex model_re("(?:^|\\n)\\s*Model\\s*:\\s*([^\\n]+)(?:\\n|$)");
        const std::string& info = shell("cat /proc/cpuinfo");
        std::smatch match; 
        if (std::regex_search(info, match, hw_re))
            debug("hw match size %lu, whole match: '%s', first capt '%s'", match.size(), match.str(0).c_str(), match.str(1).c_str());
        if (std::regex_search(info, match, rev_re))
            debug("rev match size %lu, whole match: '%s', first capt '%s'", match.size(), match.str(0).c_str(), match.str(1).c_str());
        if (std::regex_search(info, match, model_re))
            debug("model match size %lu, whole match: '%s', first capt '%s'", match.size(), match.str(0).c_str(), match.str(1).c_str());
        return "hello";
    }
    NAPI_EXPORT_PROPERTY(CFG, rev);
//    inline bool isRPi() const { return isRPi(); } //fexists("/boot/config.txt"); } //use IS_RPI macro instead?
//    NAPI_EXPORT_PROPERTY(CFG, isRPi);
//    inline const screeninfo_t screeninfo() const { return(&m_info); }
//read/write props:
    inline void openfb(int fb)
    {
        DebugScope ds("CFG::openfb");
//        if (fb && !fexists(fbdev(fb))) return; //silently ignore non-existent devices?
        int svfb = m_scrinfo.fb;
        SUPER::openfb(fb, false); //, &CFG::scrv_override); //open hidden while caller chooses config
        if (isOpen()) return;
        debug("can't open fb#%d, reopen prev fb#%d", fb, svfb);
        SUPER::openfb(svfb, false); //re-open current FB
//fill in config details:
//        bool override = false;
//        if (scrv.match(m_dpi)) { scrv = m_dpi; override = true; }
//        if (scrv.match(m_hdmi)) { scrv = m_hdmi; override = true; }
//        if (override) m_scrinfo.debug("cfg.openfb (override)", SRCLINE);
    }
    NAPI_EXPORT_PROPERTY(CFG, fb, openfb);
#if 0 //moved into FBIO
    inline int fb() const { return m_scrinfo.isvalid? m_fb: -1; }
    void fb(int n) //allow caller to select which display device to use
    {
//        m_fb.~fbinfo_t(); //dtor
//        new (&m_fb) fbinfo_t(n); //re-init; placement new calls ctor again
        close();
        m_fb = n;
        m_scrinfo.isvalid = false;
  //      snprintf(m_fbdev, sizeof(m_fbdev), "/dev/fb%u", n);
//        if (!fexists(fbdev(n))) return; //silently ignore non-existent devices
        int found = open(fbdev(n), O_RDWR);
        if (!isOpen()) RETURN(errmsg("can't open fb#%d '%s'", m_fb, fbdev(n)));
        debug("cfg fb%d '%s': xres %'d + %'d+%'d+%'d = xtotal %'d, yres %'d + %'d+%'d+%'d = ytotal %'d, pixclock %'d psec (%'d KHz) => %3.1f fps, valid? %d", m_fb, m_fbdev, scrv.xres, scrv.left_margin, scrv.hsync_len, scrv.right_margin, scrv.xtotal(), scrv.yres, scrv.upper_margin, scrv.vsync_len, scrv.lower_margin, scrv.ytotal(), scrv.pixclock, (int)psec2KHz(scrv.pixclock), scrv.fps(), m_scrinfo.isvalid);
//        close(fd);
    }
#endif //0
//    NAPI_EXPORT_PROPERTY(CFG, fb, fb, openfb); //allow Javascript to select which fb
//    inline const screeninfo_t* screeninfo() const { return &m_info; }
//    inline const screeninfo_t* screeninfo(int newfb) { fb(newfb); return &m_info; }
//    inline auto isvalid() const { return m_scrinfo.isvalid; }
//    inline auto fbdev() const { return m_fbdev; }
//    inline auto xres() const { return scrv.xres; }
//    inline auto xleft() const { return scrv.left_margin; }
//    inline auto xsync() const { return scrv.hsync_len; }
//    inline auto xright() const { return scrv.right_margin; }
//    inline auto xtotal() const { return scrv.xtotal(); }
//    inline auto yres() const { return scrv.yres; }
//    inline auto yleft() const { return scrv.upper_margin; }
//    inline auto ysync() const { return scrv.vsync_len; }
//    inline auto yright() const { return scrv.lower_margin; }
//    inline auto ytotal() const { return scrv.ytotal(); }
//    inline auto pixclock() const { return scrv.pixclock; }
//    inline auto fps() const { return scrv.fps(); } //psec2KHz(scrv.pixclock); }
//TODO: are these of interest to JavaScript? probably not
//fix: smem_start, smem_len, ywrapstep, line_length, mmio_start, mmio_len, accel, capabilities
//var: xres_virtual, yres_virtual, xoffset, yoffset, bits_per_pixel, red.*, green.*, blue.*, transp.*, height, width, accel_flags, sync
//    NAPI_EXPORT_PROPERTY(CFG, isvalid);
//    NAPI_EXPORT_PROPERTY(CFG, fbdev);
//    NAPI_EXPORT_PROPERTY(CFG, xres);
//    NAPI_EXPORT_PROPERTY(CFG, xtotal);
//    NAPI_EXPORT_PROPERTY(CFG, yres);
//    NAPI_EXPORT_PROPERTY(CFG, ytotal);
//    NAPI_EXPORT_PROPERTY(CFG, pixclock);
//    NAPI_EXPORT_PROPERTY(CFG, fps);
//    int xres, xsync, xfront, xback, yres, yfront, ysync, yback, fps, clock;
//add a couple of convenience functions:
//    int xtotal() const { return xres + xfront + xsync + xback; }
//    int ytotal() const { return yres + yfront + ysync + yback; }
//allow caller to override timing (mostly for dev/test):
#if 1 //TODO: remove?
    inline const char* timing() const { return m_timing.c_str(); } //m_timing.length()? m_timing.c_str(): 0; }
    inline void timing(const std::string& str) { timing(str.c_str()); }
    void timing(const char* str)
    {
        DebugScope ds("CFG::timing");
#if 0 //don't need?
//        const char* bp = str;
//try to extract useful part of vcgencmd output:
//        for (;;)
//        {
//            while (*bp == ' ') ++bp;
//            if (strncmp(bp, "hdmi_timings=", ))
//        }
//https://stackoverflow.com/questions/21667295/how-to-match-multiple-results-using-stdregex
//    string::const_iterator searchStart( str.cbegin() );
//    while ( regex_search( searchStart, str.cend(), res, exp ) )
//        cout << ( searchStart == str.cbegin() ? "" : " " ) << res[0];  
//        searchStart = res.suffix().first;
        std::regex find_timing("(?:^|\\n)\\s*(?:hdmi|dpi)_timings(?::\\d)?=([^\\n]+)(?:\\n|$)");
        std::smatch res;
        m_timing = str;
        while (std::regex_search(m_timing, res, find_timing))
        {
            std::string found = res[1];
            debug("parse: '%s'", nvl(found.c_str(), "??"));
            m_timing = res.suffix();
        }
        m_timing = ""; str = m_timing.c_str();
#endif //0
//            memset(&timovr, 0, sizeof(timovr);
        m_scrinfo.isvalid = false;
        if (!nvl(str)[0]) //just clear and return
        {
            if (isOpen()) openfb(m_scrinfo.fb); //, false); //restore real screen info
            RETURN(m_timing.clear());
        }
        int xres, xsync, xfront, xback, yres, yfront, ysync, yback, fps, clock;
        xres = xsync = yres = ysync = fps = clock = 0;
        xfront = xback = yfront = yback = 0;
//        int xfront = 0, xback = 0, yfront = 0, yback = 0;
        int ignore, polarity = 0, aspect = 0;
//RPi dpi_timings from /boot/config.txt
//example:  861 0 1 1 1  363 0 2 3 2  0 0 0  30 0 9600000 8
        const char* str_fix = str_replace(str_replace(str_replace(str, "hdmi_timings="), "dpi_timings="), "\n").c_str();
        int nvals = nvl(str)[0]? sscanf(str_fix, " %d %d %d %d %d  %d %d %d %d %d  %d %d %d  %d %d %d %d ",
            &xres, &ignore, &xfront, &xsync, &xback,
            &yres, &ignore, &yfront, &ysync, &yback,
            &ignore, &ignore, &ignore, &fps, &polarity, &clock, &aspect): 0;
//printf("timing: nvals %d, str '%s'\n", nvals, nvl(str, "(empty)"));
        if (/*nvals &&*/ (nvals != 17)) RETURN(clear_error(), errmsg("invalid timing: '%s' (found %d vals, expected 17)", str_fix, nvals));
        if (!(xres + xfront + xsync + xback) && !(yres + yfront + ysync + yback) && !fps && !polarity && !clock) //ignore junk entry: "0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 0 3"
        {
            if (isOpen()) openfb(m_scrinfo.fb); //, false); //restore real screen info
            RETURN(m_timing.clear());
        }
        if (!xres || !yres || !clock) RETURN(clear_error(), errmsg("invalid timing: '%s' (xres %d, yres %d, clock %d cannot be 0)", str_fix, xres, yres, clock));
//no        xsync += xfront + xback; //consolidate for simpler calculations
//no        ysync += yfront + yback;
        clock /= 1e3; //KHz
        m_scrinfo.isvalid = true;
        m_timing = str_fix;
        std::string changed;
#define UPDATE(old, new)  if (new != old) { changed += ", " #new; old = new; }
        UPDATE(scrv.xres, xres);
        UPDATE(scrv.left_margin, xfront);
        UPDATE(scrv.hsync_len, xsync);
        UPDATE(scrv.right_margin, xback);
        UPDATE(scrv.yres, yres);
        UPDATE(scrv.upper_margin, yfront);
        UPDATE(scrv.vsync_len, ysync);
        UPDATE(scrv.lower_margin, yback);
        UPDATE(scrv.pixclock, psec2KHz(clock)); //psec
#undef UPDATE
        if (!changed.length()) changed += ", (none)";
        debug(/*CYAN_MSG*/ "timing override fb#%d: hres %'d + %'d+%'d+%'d, yres %'d + %'d+%'d+%'d, fps %'d, clk %'d KHz, changed: %s", m_scrinfo.fb, xres, xfront, xsync, xback, yres, yfront, ysync, yback, fps, clock, changed.c_str() + 2);
        if (fps != (int)scrv.fps()) RETURN(clear_error(), errmsg("ignoring fps %d: doesn't match calculated fps %4.3f", fps, scrv.fps()));
    }
    NAPI_EXPORT_PROPERTY(CFG, timing, timing);
    inline void timing_update(const std::string& str) { timing_update(str.c_str()); }
    void timing_update(const char* str)
    {
        timing(str);
debug("isvalid? %d", m_scrinfo.isvalid);
        if (!m_scrinfo.isvalid) return;
        clear_error();
        m_scrinfo.isvalid = false;
//        int fd = open(m_info.fbdev, O_RDWR);
//        if (fd <= 0) RETURN(errmsg("can't open fb#%d '%s'", m_info.fb, m_info.fbdev));
        if (ioctl(FBIOPUT_VSCREENINFO, &scrv) < 0) errmsg("can't set fb#%d var info", m_scrinfo.fb);
        else { m_scrinfo.isvalid = true; debug("updated scr info"); }
        openfb(m_scrinfo.fb); //, false); //reload info
    }
#ifdef USING_NAPI
    Napi::Value timingupd_method(const Napi::CallbackInfo& info)
    {
        const /*auto*/ std::string str = info[0].As<Napi::String>();
        timing_update(str.c_str());
        return Napi::Number::New(info.Env(), m_scrinfo.isvalid);
    }
    NAPI_EXPORT_METHOD(CFG, "update_timing", timingupd_method);
#endif //USING_NAPI
#endif //1
//public: //methods
//    static bool wait4sync(int fbfd)
//    {
//        int arg = 0;
//        if (ioctl(fbfd, FBIO_WAITFORVSYNC, &arg) >= 0) return true;
//        return errmsg(false, "wait4sync failed");
//    }
    NAPI_STOP_EXPORTS(CFG); //public
};
STATIC decltype(CFG::m_all) CFG::m_all;
//defer singleton instantiation until needed:
//CFG& cfg = *CFG::singleton();
//CFG& cfg()
//{
//    static CFG m_cfg;
//    return m_cfg;
//}
//broken with worker threads :(
//NAPI_EXPORT_OBJECT(cfg); //don't export ctor/class wrapper, just instance
NAPI_EXPORT_CLASS(CFG);


///////////////////////////////////////////////////////////////////////////////
////
/// virtual pixel addressing:
//

//FB open/close wrapper:
//auto-close when done
class FB: public FBIO //: public fb_screeninfo
{
    NAPI_START_EXPORTS(FB, FBIO);
    using SUPER = FBIO;
public: //??
//    using __CLASS__ = FB; //in lieu of built-in g++ macro
//    using fd_t = int; //m_fd_nocvref = std::remove_cvref<decltype(m_fd)>::type;
//    using msec_t = decltype(now_msec()); //long int;
//    /*const fd_t*/ int m_fd = 0;
    /*const*/ msec_t m_started; //= now();
//    static CFG cfg;
//    CFG& cfg = m_cfg();
//    static inline CFG& m_cfg() { static CFG cfg; return cfg; } //singleton
//public: //typedefs
//    struct fb_screeninfo& m_info = *this;
public: //ctors/dtors
    explicit FB(): FB(CFG::any().fb()) {} //FBIO(cfg) { if (!isOpen()) open(cfg.fbdev()))} //"/dev/fb0") {} //debug("FB ctor 1"); }
    explicit FB(int fb): /*FBIO("FB"), FBIO(get_cfg(fb)),*/ m_started(now_msec()) //"/dev/fb0") {} //debug("FB ctor 1"); }
    {
//debug("fb@ 0x%p ctor enter, fb# %d vs cfg %d", this, fb, cfg.fb());
        if (fb == CFG::any().fb()) m_scrinfo = *CFG::any().scrinfo(); //use current config info (could be overridden)
        openfb(fb); //, true);
//debug("w4s %d", wait4sync());
//        visible(true); //caller wants access; make it visible
//    int m_fb;
//    char m_fbdev[30];
//        if (fb != cfg.fb()) cfg.fb(fb); //get info for requested fb
//        if (!cfg.isOpen()) cfg.open();
//        *(FBIO*)this = (FBIO)cfg; //take ownership of open fb
//debug("fb@ 0x%p ctor exit", this);
    }
    ~FB() { close(); }
private: //ctor helpers
    inline void openfb(int fb) { SUPER::openfb(fb, true); } //caller wants to update pixels; set visible
//    FBIO& get_cfg(int fb)
//    {
//        if ((fb != cfg.fb()) || !cfg.isOpen()) cfg.openfb(fb); //check if requested fb is open in cfg first
//        return cfg;
//    }
//    explicit FB(): FB(cfg.fbdev()) {} //"/dev/fb0") {} //debug("FB ctor 1"); }
//    explicit FB(const char* name): m_started(now_msec()) { open(name, O_RDWR); } //debug("FB ctor 2"); }
//    explicit FB(const char* name): FB(open(name, O_RDWR)) {} //debug("FB ctor 2"); }
//    explicit FB(int fd): /*m_fd(fd),*/ m_started(now_msec()) //: m_info({0}) //: m_fd(0), m_started(now())
//    {
//        clear_error();
//debug("FB ctor 3");
//debug("fb fd %lu:%d, started@ %lu:%'d, elapsed %lu:%'d", sizeof(fd), fd, sizeof(m_started), m_started, sizeof(elapsed()), elapsed());
//debug("cur disp mode: %d bpp, %s %'d x %'d", SDL_BITSPERPIXEL(sdl_mode.format), SDL_GetPixelFormatName(sdl_mode.format), sdl_mode.w, sdl_mode.h); //should match "tvservice -s"
//        if (!isOpen(fd)) RETURN(errmsg("fb open"));
//        if (!m_info.var.pixclock) RETURN(errmsg("get pixel clock"));
//        *(fd_t*)&m_fd = fd; //set Open status only after getting screen info; bypass "const" within ctor
//    }
//    ~FB() { if (isOpen(m_fd)) close(m_fd); }
//public: //operators
//    explicit inline operator fd_t() const { return(m_fd); } //debug("int fd %d", m_fd); return(m_fd); }
//    explicit operator const decltype(m_info)* () { return screeninfo(); }
public: //getters/setters
    NAPI_EXPORT_PROPERTY(FB, fb, openfb);
//    static inline msec_t now() { return(now_msec()); }
    inline msec_t elapsed() const
    {
//debug("elapsed: %'d - %'d = %'d", now(), m_started, now() - m_started);
        return(now_msec() - m_started);
    }
    void elapsed(msec_t new_elapsed)
    {
        wait4sync(); //kludge: try to sync with gpu; will have a little latency here; CAUTION: blocks caller for up to 1 frame
        msec_t old_elapsed = elapsed();
        /* *(msec_t*)&*/ m_started += old_elapsed - new_elapsed; //bypass "const"
//reset frame count as well; preserve frame rate:
        sync_good = old_elapsed? new_elapsed * sync_good / old_elapsed: 0;
        sync_errs = old_elapsed? new_elapsed * sync_errs / old_elapsed: 0;
//also idle time:
        m_slept = old_elapsed? new_elapsed * m_slept / old_elapsed: 0;
        debug("elapsed reset: %'d -> %'d msec", old_elapsed, new_elapsed);
    }
//static_assert(std::is_integral<decltype(NULL_OF(FB)->elapsed())>::value);
//static_assert(!std::is_floating_point<decltype(NULL_OF(FB)->elapsed())>::value);
//static_assert(!std::is_string<decltype(NULL_OF(FB)->elapsed())>::value);
    NAPI_EXPORT_PROPERTY(FB, elapsed, elapsed);
public: //methods
//    inline bool isOpen() const { return(isOpen(m_fd)); }
    NAPI_EXPORT_PROPERTY(FB, isOpen);
//    inline const auto /*decltype(m_info)**/ screeninfo() const { return(&m_info); }
//wait for video sync:
//allows very simple timing control; GPU controls caller's frame update rate
    msec_t m_slept = 0; //total time spent waiting for vsync; use for perf tuning
    inline msec_t slept() const { return m_slept; }
    inline void slept(msec_t newtime) { m_slept = newtime; }
    NAPI_EXPORT_PROPERTY(FB, slept, slept);
    int sync_good = 0, sync_errs = 0; //won't ever wrap @60 fps
    inline int numfr() const { return(sync_good + sync_errs); }
    NAPI_EXPORT_PROPERTY(FB, numfr);
//too confusing:    inline /*double*/float fps() const { msec_t elaps = elapsed(); return(elaps? 1e3 * numfr() / elaps: scrv.fps()); } //use actual if available, else theoretical
//    NAPI_EXPORT_PROPERTY(FB, fps);
//    int frtime() const { return scrv.frtime(); } //theoretical, usec
//    NAPI_EXPORT_PROPERTY(FB, frtime);
    bool wait4sync() //bool delay_on_error = true)
    {
//        if (fbfd < 0) return -1;
//debug("wait4sync: op? %d, #good %'d, #errs %'d, frtime %'d, elapsed %'d", isOpen(), sync_good, sync_errs, frtime(), elapsed());
#if 0
        if (isOpen()) //m_fd))
        {
//            int arg = 0;
            m_slept -= now_msec();
//            if (fb_ioctl(m_fd, FBIO_WAITFORVSYNC, &arg) >= 0) { m_slept += now(); return(++sync_good); } //true
            if (wait4sync(m_fd)) { m_slept += now_msec(); return(++sync_good); } //true
            ++sync_errs; //only count errors if open
        }
        /*if (delay_on_error)*/ usleep(frtime()); //* 1e3); //wait 1/60 sec in attempt to maintain caller timing
        return(false); //error or !open
#endif //0
        m_slept -= now_msec();
        bool ok = SUPER::wait4sync(frtime()); // / 1e3);
        m_slept += now_msec();
        if (ok) ++sync_good; else ++sync_errs;
        return ok;
    }
#ifdef USING_NAPI
    Napi::Value await4sync_method(const Napi::CallbackInfo& info)
    {
        auto async_exec = [this]() -> bool { return wait4sync(); };
        NAPI_ASYNC_RETURN(async_exec);
    }
    NAPI_EXPORT_METHOD(FB, "await4sync", await4sync_method);
#endif //def USING_NAPI
    inline bool wait_sec(int sec) { return wait_msec(sec * 1e3); }
//TODO? wait_until(msec_t elapsed)
    bool wait_msec(int msec)
    {
//debug("wait %d msec", msec);
        constexpr int day = 24 * 60 * 60 * 1e3; //msec
        const msec_t slept_at = now_msec(); //wakeup = now_msec() + msec; //TODO: use last sync timestamp?
        if ((msec > day) || (msec < -day)) debug("wait_msec: delay %'d probably wrong");
        bool retval = true;
        for (;;)
        {
            retval = wait4sync() && retval; //wait at least 1 frame
//            int remaining = wakeup - now();
//            if (!ok) if (remaining > 0) usleep(remaining * 1e3);
//debug("now %'d, wkup %'d, ret? %d", now(), wakeup, now() >= wakeup);
            if (msec > day) return false; //msec = msec_per_day; //probably a caller bug; limit damage
//            if (now_msec() >= wakeup) return(retval); //breaks if time wraps (~1.2 hr)
            if (now_msec() - slept_at > msec) return(retval); //use subtraction to allow time to wrap; else breaks when time wraps (~1.2 hr)
            if (now_msec() < slept_at) debug(RED_MSG "time wrapped, still sleeping? %'d - %'d !> %'d", now_msec(), slept_at, msec);
        }
    }
#ifdef USING_NAPI
    Napi::Value awaitsec_method(const Napi::CallbackInfo& info)
    {
//debug("async method: #args %d, arg[0] %s", info.Length(), NapiType(info[0]));
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "seconds (1 Number) expected; got %d %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()));
        int delay_msec = info[0].As<Napi::Number>().Int32Value() * 1e3;
//TODO: reuse awaitmsec_method?
        auto async_exec = [this, delay_msec]() -> bool { return wait_msec(delay_msec); };
        NAPI_ASYNC_RETURN(async_exec);
    }
    Napi::Value awaitmsec_method(const Napi::CallbackInfo& info)
    {
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "milliseconds (1 Number) expected; got %d %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()));
//        const auto delay_msec = info[0].As<Napi::Number>().Int32Value();
        int delay_msec = info[0].As<Napi::Number>().Int32Value();
        auto async_exec = [this, delay_msec]() -> bool { return wait_msec(delay_msec); };
        NAPI_ASYNC_RETURN(async_exec);
    }
    NAPI_EXPORT_METHOD(FB, "await_sec", awaitsec_method);
    NAPI_EXPORT_METHOD(FB, "await_msec", awaitmsec_method);
#endif //def USING_NAPI
    NAPI_STOP_EXPORTS(FB); //public
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
//decltype(FB::cfg) FB::cfg;


//memory-mapped FB pixels:
//only useful for drawing regular graphics to screen via FB
//auto-close (unmap) when done
//template</*int BPP = 4,*/ bool BOUNDS_CHECK = true>
class FBPixels: public FB
{
    NAPI_START_EXPORTS(FBPixels, FB);
//    using __CLASS__ = FBPixels; //in lieu of built-in g++ macro
public: //typedefs
//    static constexpr int CACHELEN = 64; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both
//    using data_t = color_t; //argb_t; //uint32_t; //vs rgb888_t, rgb565_t
    using color_t = uint32_t;
    using col_t = ary<FBPixels, color_t>;
    using row_t = ary<FBPixels, col_t, color_t>;
//    using size_t = unsigned int; //unsigned long int; //CAUTION: needs to be unsigned for simpler bounds checking
//    struct leaf_t { static const size_t m_len = 1; }; //kludge: proxy for data_t
//    using ary2D = ary<ary<data_t>>;
//    using ary1D = ary<data_t>;
//    using ary0D = data_t;
private:
//    int m_bpp;
    color_t* const m_px;
//    data_t* const* const m_rowpx; //for 2D access
    color_t m_dummy; //1 dummy pixel for out-of-bounds l-value/ref
    const size_t m_rowlen32, m_width, m_height; //CAUTION: horizontal raster lines might be padded, so store effective width
    const size_t m_numpx; //slightly WET to reduce run-time bounds checking :(
//    int m_dirty;
    float m_zoom; //make it easier to debug on high res or small screens
public: //ctors/dtors
//CAUTION (init order): pixels has dependencies
    explicit FBPixels(): FBPixels(CFG::any().fb()) {}
    explicit FBPixels(int fb): FB(fb), m_px(m_px_init()), pixels(*(/*std::remove_reference<pixels>::type*/row_t*)m_px), m_dummy(0), m_rowlen32(scrf.line_length / sizeof(m_px[0])), m_width(scrv.xres), m_height(scrv.yres/*.ytotal()*/), m_numpx(m_rowlen32 * m_height), m_zoom(1.0) //, m_dirty(false) //NOTE: incl vblank to match underlying framebuffer, even though unused
//broken    PERFWD_CTOR(explicit FBPixels, FB), m_px(m_px_init()), pixels(*(ary<ary<data_t>>*)m_px), m_dummy(0), m_rowlen32(scrf.line_length / 4), m_height(scrv.yres), m_numpx(m_rowlen32 * m_height)
    {
//debug("FBPixels ctor enter");
//debug("w4s %d", wait4sync());
        clear_error();
//        debug("FBPixels::ctor, isOp? %d, color %lu bytes", isOpen(), sizeof(m_px[0]));
//    explicit empty_base(ARGS&& ... args) {} //: base(std::forward<ARGS>(args) ...)
//        auto scrinfop = screeninfo();
        if (fb < 0) return; //caller doesn't want to open yet?
        if (!isOpen()) RETURN(errmsg("open framebuffer"));
        switch (bpp()) //scrinfop->var.bits_per_pixel)
    	{
//	    	case 16: RETURN(errmsg("TODO: RGB565?"));
            case 24: break; //RETURN(errmsg("TODO: RGB24"));
            case 32: break; //RETURN(errmsg("TODO: RGB32"));
            default: RETURN(errmsg("unhandled pixel format: %d bpp (wanted 24 or 32)", bpp()));
        }
//        m_size = width() * height(); //screeninfo()->var.xres * screeninfo()->var.yres; // * scrinfo->var.bits_per_pixel / 8;
//        m_width = screeninfo()->var.xres;
#if 0
//        auto scrinfo = screeninfo();
        debug("(color masks 8-bit, byte aligned, little endian) red: %'d:+%'d^%'d, green: %'d:+%'d^%'d, blue: %'d:+%'d^%'d, xpar: %'d:+%'d^%'d, xofs %'d, yofs %'d",
            scrv.red.length, scrv.red.offset, scrv.red.msb_right,
            scrv.green.length, scrv.green.offset, scrv.green.msb_right,
            scrv.blue.length, scrv.blue.offset, scrv.blue.msb_right,
            scrv.transp.length, scrv.transp.offset, scrv.transp.msb_right,
            scrv.xoffset, scrv.yoffset);
#endif //0
//        size_t new_height = scrv.yres;
//        size_t new_rowlen32 = scrf.line_length / 4; //NOTE: might be larger than screen hres due to padding
//        size_t new_numpx = new_height * new_rowlen32; //only set size if mmap successful; NOTE: might be larger than screen hres due to padding
//        if (new_rowlen32 != screeninfo()->var.xres) debug(YELLOW_MSG "CAUTION: raster rowlen32 %'lu != width %'d", new_rowlen32, screeninfo()->var.xres);
//        if (new_height * new_rowlen32 * 4 != scrf.smem_len) debug(YELLOW_MSG "CAUTION: raster size %'lu != calc %'d", new_height * new_rowlen32 * 4, scrf.smem_len);
//        *(data_t**)&m_px = (data_t*)fb_mmap((void*)0, new_height * new_rowlen32 * 4, PROT_READ | PROT_WRITE, MAP_SHARED, (int)*this, 0); //shared with GPU
        if (m_px == (color_t*)MAP_FAILED) RETURN(errmsg("px mmap"));
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
        row_t::m_limit = col_t::m_limit = m_px + m_numpx;
        row_t::m_len = m_height;
        col_t::m_len = m_rowlen32; //CAUTION: logical (padded), not physical (visible)
debug("FBPixels::ctor: px@ 0x%p, bpp %d, size %'lu bytes (info says %'d), rowlen32 %'lu (vis w %'lu), vis h %'lu, #px %'lu (padded) %'lu (vis), pxrow[0]@ 0x%p, pxrow[1]@ 0x%p, pxeof[h %'lu]@ 0x%p", m_px, bpp(),  m_height * m_rowlen32 * sizeof(m_px[0]), scrf.smem_len, m_rowlen32, m_width, m_height, m_numpx, m_height * m_width, &pixels[0], &pixels.at(1), m_height, &pixels[m_height]);
//no; leave contents intact        memset(m_px, 0, m_numpx * BPP()); //start all transparent black
//debug("w4s %d", wait4sync());
//debug("FBPixels ctor exit");
    }
    ~FBPixels()
    {
        clear_error();
//        debug("FBPixels::dtor");
//        if (m_rowpx) delete m_rowpx; //m_rowpx = 0;
        if (m_numpx && (munmap((color_t*)m_px, m_numpx * sizeof(m_px[0])) == -1)) errmsg("px munmap");
    }
    FBPixels(const FBPixels& that): m_px(0), pixels(*(row_t*)m_px), m_dummy(0), m_rowlen32(0), m_width(0), m_height(0), m_numpx(0), m_zoom(0) { *this = that; } //avoid [-Weffc++] warning
private: //ctor helpers (member init)
    color_t* m_px_init()
    {
//        auto scrinfo = screeninfo();
//width, height are visible pixels only (excludes blank time)
        size_t width = scrv.xres; //scrinfo->var.xres; //xtotal(); //scrinfo->var.xres + scrinfo->var.left_margin + scrinfo->var.hsync_len + scrinfo->var.right_margin;
        size_t height = scrv.yres; //scrinfo->var.yres; //ytotal(); //scrinfo->var.yres + scrinfo->var.upper_margin + scrinfo->var.vsync_len + scrinfo->var.lower_margin;
        size_t rowlen32 = scrf.line_length / sizeof(m_px[0]); //NOTE: might be larger than screen hres due to padding
//TODO: stretch? (easier to see for dev/debug)
        if (rowlen32 != width) debug(YELLOW_MSG "CAUTION: raster rowlen32 %'lu != scr width %'d + %'d+%'d+%'d; JS will see narrower width", rowlen32, scrv.xres, scrv.left_margin, scrv.hsync_len, scrv.right_margin);
        if (height * rowlen32 * sizeof(m_px[0]) != scrf.smem_len) debug(YELLOW_MSG "CAUTION: raster size %'lu != scr mem len %'d", height * rowlen32 * sizeof(m_px[0]), scrf.smem_len);
//        SDL_SetError("(potential multi-CPU contention)");
//        if ((rowlen32 * 4) % CACHELEN) debug(YELLOW_MSG "row len !multiple of cache size %'d: 0x%lx", CACHELEN, rowlen32 * 4);
        return isOpen()? (color_t*)mmap((void*)0, height * rowlen32 * 4, PROT_READ | PROT_WRITE, MAP_SHARED, /*(int)*this m_fd,*/ 0): (color_t*)MAP_FAILED; //shared with GPU
    }
public: //operators
    FBPixels& operator=(const FBPixels& that) { return *this = that; } //[-Weffc++]
public: //getters/setters
    inline void openfb(int fb) //need to re-init
    {
//no        SUPER::openfb(fb, true); //caller wants to update pixels; set visible
//        close();
        this->~FBPixels();
        new (this) FBPixels(fb); //use placement new to re-init with different fb
    }
    NAPI_EXPORT_PROPERTY(FBPixels, fb, openfb);
    inline size_t width() const { return m_width; } //scrv.xres; } //logical
    NAPI_EXPORT_PROPERTY(FBPixels, width);
    inline size_t rowlen() const { return(m_rowlen32); } //padded; //screeninfo()->var.xres); }
    NAPI_EXPORT_PROPERTY(FBPixels, rowlen);
    inline size_t height() const { return(m_height); } //screeninfo()->var.yres); }
    NAPI_EXPORT_PROPERTY(FBPixels, height);
    inline /*auto*/ int bpp() const { return(scrv.bits_per_pixel); } //screeninfo()->var.bits_per_pixel); } //bits
    inline float zoom() const { return m_zoom; }
    inline void zoom(float newzoom) { m_zoom = newzoom; }
    NAPI_EXPORT_PROPERTY(FBPixels, zoom, zoom);
#pragma message(YELLOW_MSG "TODO: impl zoom")
    NAPI_EXPORT_PROPERTY(FBPixels, bpp);
    inline /*auto*/ int BPP() const { return(bpp() / 8); } //screeninfo()->var.bits_per_pixel / 8); } //bytes
//public: //methods
//NOTE: compiler should be smart enough to optimize out unneeded checks:
//#if 1
//    inline bool dirty() const { return !!m_dirty; }
//TODO?    void dirty(int now_dirty) { m_dirty = now_dirty; } //custom dirty repaint
//    inline void dirty(bool now_dirty) { m_dirty = now_dirty? 2: 0; } //compensate for double buffering?
    NAPI_EXPORT_PROPERTY(FBIO, dirty, dirty);
    row_t& pixels; //2D pixel array access; at() bounds check, "[]" no bounds check
//    data_t& operator() (size_t x, size_t y) { return m_buf[x + y * h]; }
//    inline bool inbounds(size_t xyinx) const { return(/*BOUNDS_CHECK?*/ (xyinx < m_numpx)); }
    inline bool inbounds(size_t x, size_t y) const { return(/*!BOUNDS_CHECK ||*/ ((x < m_width) && (y < m_height))); } //x < m_rowlen32
    inline size_t xyinx(size_t x, size_t y) const { return(inbounds(x, y)? y * m_rowlen32 + x: m_numpx); } //? m_numpx: -1); } //-1); } //CAUTION: invalid index should also fail bound check, but should still allow use as upper limit
//    data_t& pixel(size_t x, size_t y) { return(inbounds(x, y)? m_px[xyinx(x, y)]: m_dummy); } //rd/wr
    inline color_t& pixel(size_t x, size_t y, color_t color) { dirty(true); return pixel(x, y) = color; } //rd/wr
    inline color_t& pixel(size_t x, size_t y) { return pixels.at(y).at(x); } //return m_buf[x + y * ary<ary<data_t>>::m_len]; }
//    const data_t& pixel(size_t x, size_t y) const { return(inbounds(x, y)? m_px[xyinx(x, y)]: 0); } //rd-only
//!worky unless rowlen32 == width    inline color_t& pixel(size_t ofs) { return pixels[0].at(ofs); } //return(inbounds(ofs)? m_px[ofs]: m_dummy); } //rd/wr
//    const data_t& pixel(size_t ofs) const { return(inbounds(ofs)? m_px[ofs]: 0); } //rd-only
//#else
//(x, y) access to pixels (intended for low-volume usage):
//    bool inbounds(size_t x, size_t y) const { return(!BOUNDS_CHECK || ((x < m_rowlen32) && (y < m_height))); }
//    size_t xyinx(size_t x, size_t y) const { return(inbounds(x, y)? y * m_rowlen32 + x: m_numpx); } //? m_numpx: -1); } //-1); } //CAUTION: invalid index should also fail bound check, but should still allow use as upper limit
//    color_t& pixel(size_t x, size_t y) { return(pixel(xyinx(x, y))); } //rd/wr
//    const color_t& pixel(size_t x, size_t y) const { return(pixel(xyinx(x, y))); } //rd-only
//linear/array access to pixels:
//NOTE: caller can ignore padding because width is compensated
//    bool inbounds(size_t ofs) const { return(BOUNDS_CHECK? (ofs < m_numpx): m_numpx); }
//    color_t& pixel(size_t ofs) { return(inbounds(ofs)? m_px[ofs]: m_dummy); } //rd/wr
//    const color_t& pixel(size_t ofs) const { return(inbounds(ofs)? m_px[ofs]: 0); } //rd-only
//#endif
#ifdef USING_NAPI
//    NAPI_EXPORT(FBPixels, pixels);
    Napi::Value pixels_getter(const Napi::CallbackInfo &info)
    {
//CAUTION: caller is responsible for setting dirty flag
//        Napi::Env env = info.Env();
        int w = width(), h = height();
        uint32_t* pxbuf = &pixels[0][0]; //(w * h);
        if (!pxbuf || !w || !h) return err_napi(info.Env(), "pixel buffer broken");
        auto retval = Napi::Array::New(info.Env(), h);
//CAUTION: restrict width to visible pixels
        auto arybuf = Napi::ArrayBuffer::New(info.Env(), pxbuf, /*rowlen() * h*/m_numpx * sizeof(*pxbuf)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        for (uint32_t y = 0; y < h; ++y)
        {
            int len = w; //y? w: (h - y) * w; //DOESN'T ALLOW SIZE OVERRIDE- allow caller to use linear addresses on first row; TODO: allow on other rows also?
            auto rowary = Napi::TypedArrayOf<uint32_t>::New(info.Env(), len, arybuf, /*y * w*/ xyinx(0, y) * sizeof(*pxbuf), napi_uint32_array); ////https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
//?            retval.set(y, rowary);
            retval[y] = rowary; //CAUTION: RPi needs y to be uint32_t
        }
//Buffer<t> Napi::Buffer<t>::New(env, data*, len);
        return retval; //array of typed arrays
    }
    NAPI_EXPORT_WRAPPED_PROPERTY(FBPixels, "pixels", pixels_getter);
//CAUTION: intended for low bandwidth usage (due to high per-access overhead)
    Napi::Value pixel_method(const Napi::CallbackInfo& info)
    {
        const auto x = info[0].As<Napi::Number>().Int32Value();
        const auto y = info[1].As<Napi::Number>().Int32Value();
//debug("pixel() %lu args", info.Length());
//if (info.Length() >= 2) debug("x %d, y %d", x, y);
//debug("inx %lu", ixy);
//help caller to debug indexing errors (assumes low bandwidth):
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber() || !inbounds(x, y) || ((info.Length() > 2) && !info[2].IsNumber())) return err_napi(info.Env(), "x 0..%'d, y 0..%'d, optional color (all Numbers) expected, got %d", width() - 1, height() - 1, info.Length());
//        size_t ixy = xyinx(x, y);
        if (info.Length() > 2)
        {
            const auto color = info[2].As<Napi::Number>().Uint32Value();
//debug("color 0x%x", color);
//            pixel(ixy) = color;
            pixels[y][x] = color;
            dirty(true);
        }
        return Napi::Number::New(info.Env(), pixels[y][x]); //(ixy));
    }
    NAPI_EXPORT_METHOD(FBPixels, "pixel", pixel_method);
#endif //def USING_NAPI
public: //methods
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
//        debug("fill %'lu px with ext 0x%x", m_numpx, color/*.uint32*/);
//        for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color; //.uint32;
        for (size_t y = 0, ofs = 0; y < m_height; ++y)
            for (size_t x = 0; x < m_rowlen32; ++x, ++ofs)
                m_px[ofs] = (x < m_width)? color: //.uint32;
                    ((x + y) / 2 % 4)? ::BLACK: ((x + y) / 2 % 8)? ::RED: ::WHITE; //dev/debug: put cross-hatch on padded px
        dirty(true);
    }
#ifdef USING_NAPI
    Napi::Value fill_method(const Napi::CallbackInfo& info)
    {
        if ((info.Length() != 1) || !info[0].IsNumber()) return err_napi(info.Env(), "color (1 Number) expected, got %d %s", info.Length(), "(TODO: napi type)");
        const auto color = info[0].As<Napi::Number>().Uint32Value();
        fill(color); //updates pixel array in memory
        return info.Env().Undefined(); //Napi::Number::New(info.Env(), 0);
    }
    NAPI_EXPORT_METHOD(FBPixels, "fill", /*&FBPixels::*/fill_method);
#endif //def USING_NAPI
    void row(size_t y, uint32_t color) //argb)
    {
//        color_t color(argb);
//        debug("fill %'d px @%p+[%'d..%'d) with 0x%x", m_numpx, m_px, xyinx(0, y), xyinx(0, y + 1), color);
        for (size_t i = xyinx(0, y), limit = /*xyinx(0, y + 1)*/ i + m_width; i < limit; ++i) m_px[i] = color; //.uint32;
//        int sv_dirty = dirty();
        dirty(true);
//        debug("dirty %d -> %d", sv_dirty, dirty());
    }
#ifdef USING_NAPI
    Napi::Value row_method(const Napi::CallbackInfo& info)
    {
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber()) return err_napi(info.Env(), "row index 0..%'d, color (both Numbers) expected, got %d %s", height() - 1, info.Length(), "(TODO: napi type)");
        const auto y = info[0].As<Napi::Number>().Int32Value();
        const auto color = info[1].As<Napi::Number>().Uint32Value();
        row(y, color);
        return info.Env().Undefined(); //Napi::Number::New(info.Env(), 0);
    }
    NAPI_EXPORT_METHOD(FBPixels, "row", /*&FBPixels::*/row_method);
#endif //def USING_NAPI
    void col(size_t x, uint32_t color) //argb)
    {
//        color_t color(argb);
//        debug("fill %'d px with 0x%x", m_numpx, color.uint32);
        for (size_t i = xyinx(x, 0); i < m_numpx; i += m_rowlen32) m_px[i] = color; //.uint32;
        dirty(true);
    }
#ifdef USING_NAPI
    Napi::Value col_method(const Napi::CallbackInfo& info)
    {
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber()) return err_napi(info.Env(), "column index 0..%'d, color (both Numbers) expected, got %d %s", width() - 1, info.Length(), "(TODO: napi type)");
        const auto x = info[0].As<Napi::Number>().Int32Value();
        const auto color = info[1].As<Napi::Number>().Uint32Value();
        col(x, color);
        return info.Env().Undefined(); //Napi::Number::New(info.Env(), 0);
    }
    NAPI_EXPORT_METHOD(FBPixels, "col", /*&FBPixels::*/col_method);
#endif //def USING_NAPI
//#ifndef HAS_SDL //kludge: missing method
//    int fb_clear(uint32_t ext_color) { return fill(ext_color); }
//#endif //ndef HAS_SDL
    NAPI_STOP_EXPORTS(FBPixels); //public
};
NAPI_EXPORT_CLASS(FBPixels);
//CAUTION: static class members need init value in order to be found; overwrite later
template<> STATIC /*size_t*/ decltype(FBPixels::row_t::m_len) FBPixels::row_t::m_len = 0;
template<> STATIC /*FBPixels::color_t**/ decltype(FBPixels::row_t::m_limit) FBPixels::row_t::m_limit = 0;
template<> STATIC /*const char**/ decltype(FBPixels::row_t::item_type) FBPixels::row_t::item_type = "pixel row";
template<> STATIC /*size_t*/ decltype(FBPixels::col_t::m_len) FBPixels::col_t::m_len = 0;
template<> STATIC /*FBPixels::color_t**/ decltype(FBPixels::col_t::m_limit) FBPixels::col_t::m_limit = 0;
template<> STATIC /*const char**/ decltype(FBPixels::col_t::item_type) FBPixels::col_t::item_type = "pixel col";


///////////////////////////////////////////////////////////////////////////////
////
/// 24-channel parallel port
//


//allow linear px addressing to skip over gaps (hblank):
template<typename T, int TAG = __LINE__>
class GapPtr
{
#if 0 //no worky :(
//detect attempts to store real data in gap (imaginary hblank pixels):
    template <typename Z = T>
    struct GapProtect
    {
        Z m_data; //can't inherit from "int", so use a member :(
//    public:: //ctor/dtor
//        Z(): m_data(0) {}
//        ~Z() {}
//        Z(const Z& that): m_data(that.m_data) {}
//    public: //operators
        inline GapProtect& operator=(const Z& that) { no_debug("gapprot: *0x%p = %d", this, that); if (that) errmsg("storing non-0 data 0x%x in storage gap@ %p", that, this); return *this; }
        inline /*Z&*/ operator Z&() const { return m_data; }
        inline operator Z*() const { return &m_data; }
    };
//override to allow storage in real pixels:
//use derived class so retval type is consistent
    template <typename Z = T>
    struct NoGap: GapProtect<Z>
    {
        inline Z& operator=(const Z& that) { no_debug("noprot: *0x%p = %d", this, that); return *this = that; }
    };
#endif //0
//protected:
private:
    T* m_ptr;
//    const T* const m_first;
//use static data to streamline copy ctor and operator=; sizeof(*this) should == 4
//CAUTION: assumes only one ptr geometry will be needed; add template arg if multiple needed
//    /*const*/ static T* m_nextgap; //start of next gap
//use static wrappers to avoid need for dangling member decls:
    static inline T*& m_gapend(T* newend) { return m_gapend() = newend; }
    static inline T*& m_gapend() { static T* gapend; return gapend; } //start of next gap
//    /*const*/ static int m_rowlen, m_gaplen;
    static inline size_t& m_rowlen(int newlen) { return m_rowlen() = newlen; }
    static inline size_t& m_rowlen() { static size_t rowlen; return rowlen; }
    static inline size_t& m_gaplen(int newlen) { return m_gaplen() = newlen; }
    static inline size_t& m_gaplen() { static size_t gaplen; return gaplen; }
    static inline size_t& m_padlen(int newlen) { return m_padlen() = newlen; }
    static inline size_t& m_padlen() { static size_t padlen; return padlen; }
//saved/temp value for postfix operators:
    static inline GapPtr& m_retval(const GapPtr& newptr) { return m_retval() = newptr; }
    static inline GapPtr& m_retval() { static GapPtr retval(0); return retval; }
public: //ctor/dtor
    GapPtr(T* ptr, int rowlen, int gaplen, int padlen): /*want_debug(false),*/ m_ptr(ptr) /*, m_first(ptr), nextgap(ptr + rowlen + gaplen), rowlen(rowlen), gaplen(gaplen)*/ { m_gapend(ptr + rowlen + gaplen); m_rowlen(rowlen); m_gaplen(gaplen); m_padlen(padlen); } //debug("ctor: ptr 0x%p 0x%p, row %d, gap %d", ptr, m_ptr, rowlen, gaplen); }
    ~GapPtr() {}
    GapPtr(const GapPtr& that): m_ptr(that.m_ptr)/*, want_debug(false)*/ /*, m_nextgap(that.m_nextgap), m_rowlen(that.m_rowlen), m_gaplen(that.m_gaplen)*/ { no_debug("copy ctor(obj) 0x%p", that.m_ptr); } //*this = that; } //avoid [-Weffc++] warning
private:
    GapPtr(T* that): m_ptr(that)/*, want_debug(false)*/ { no_debug("copy ctor(ptr) 0x%p", that); } //*this = that; } //avoid [-Weffc++] warning
public: //operators
//NOTE: gap will be protected during ptr deref (if target is writable)
    inline GapPtr& operator++() { no_debug("pre-inc"); ++fixup(); return *this; } //pre-inc
    inline GapPtr& operator--() { no_debug("pre-dec"); --fixup(); return *this; } //pre-dec
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Weffc++" //C++ doesn't want ref ret type; override
//CAUTION: ret ref to temp to reduce mem mgmt
//no    inline GapProtect<T>& operator++(int) { prep(); return protect(m_ptr++); } //post-inc
    inline GapPtr& operator++(int) { no_debug("post-inc"); m_retval(*this); ++fixup(); return m_retval(); } //post-inc
    inline GapPtr& operator--(int) { no_debug("post-dec"); m_retval(*this); --fixup(); return m_retval(); }; //post-dec
#pragma GCC diagnostic pop
//NOTE: return raw ptr here in order to avoid temp + copy ctor:
//    inline /*GapPtr&*/ T* operator++(int) { prep(); return m_ptr++; } //post-inc
//    T* operator->() { return m_values[m_ptr]; } //faked memory; alloc as needed
    inline operator const T*() { no_debug("ro deref 0x%p", m_ptr); return fixup(); } //don't allow caller to write
#if 0 //no worky :(
    inline GapProtect<T>& operator*() { no_debug("rw deref 0x%p", m_ptr); return protect(fixup()); } //debug("opT* ret 0x%p", m_ptr); return m_ptr; }
//..    inline operator*() const { prep(); return }
#else
//    bool want_debug;
    /*inline*/ /*GapPtr&*/ void gapsave(const T& that) //equiv to "*ptr++ = val";
    {
//static int count = 0;
// /*if (!count++)*/ debug("gapsave[%'d]: ptr 0x%p, gapend@ 0x%p, rowlen %'d, gaplen %'d, padlen %'d", count++, m_ptr, m_gapend(), m_rowlen(), m_gaplen(), m_padlen());
        if (m_gaplen() == 1) //optimize for gap len 1
        {
            if (m_ptr != m_gapend() - 1) *fixup()++ = that; //RETURN(*m_ptr++ = that);
//#if 1 //debug
//if (want_debug) debug("gapsave: ptr@ %d:0x%p, gap@ 0x%p..0x%p '%'lu", sizeof(m_ptr), m_ptr, m_gapend() - m_gaplen(), m_gapend(), m_gapend() - m_ptr);
            else if (!RGBbits(that)) fixup()++;
            else errmsg("attempt to store RGB data 0x%x in storage gap@ 0x%p", that, fixup()++);
//#endif //1
//            m_gapend() += m_padlen() + m_rowlen();
//            m_ptr += m_padlen();
            return;
        }
//static int count = 0;
//if (!count++) debug(YELLOW_MSG "gap!1");
#if 1 //debug
//if (want_debug) debug("gapsave: ptr@ %d:0x%p, gap@ 0x%p..0x%p '%'lu", sizeof(m_ptr), m_ptr, m_gapend() - m_gaplen(), m_gapend(), m_gapend() - m_ptr);
        bool want_protect = (m_ptr >= m_gapend() - m_gaplen()) && (m_ptr < m_gapend());
        if (!want_protect) *fixup()++ = that;
        else if (!RGBbits(that)) fixup()++;
        else errmsg("attempt to store RGB data 0x%x in storage gap@ 0x%p", that, fixup()++);
#else
        *fixup()++ = that;
#endif //1
//        return *this;
    }
//use this ONLY if guaranteed NOT to overwrite gap:
    inline /*GapPtr&*/ void nongapsave(const T& that) //equiv to "*ptr++ = val";
    {
        *m_ptr++ = that;
    }
#endif //0
//    inline operator const void*() { return fixup(); }
//    inline /*GapProtect<T>&*/ operator GapProtect<T>*&() { prep(); return protect(m_ptr); }
//    operator void*() { return m_ptr; }
//    T& operator*()
//    {
//        if (!isreal()) throw
//        return *m_ptr;
//    }
    size_t operator-(const T* rhs) { return fixup() - rhs; }
    const T* operator+(int rhs) { return fixup() + rhs; }
    inline GapPtr& operator=(const GapPtr& that) { /*debug("op=")*/; m_ptr = that.m_ptr; return *this; } //new (this) GapPtr(that); return *this; } //avoid [-Weffc++]
private: //helpers
//    inline bool isgap() const { return m_ptr == m_nextgap(); } //(m_ptr - m_first) % m_virtlen < m_reallen; }
#if 0 //no worky :(
//prevent caller from storing real data in gap:
    static inline GapProtect<T>& protect(T* ptr)
    {
//use placement new to create in-place data wrapper (avoids extra mem mgmt):
//        return isgap()? new (ptr) GapProtect<T>(): new (ptr) NoGap<T>();
        bool want_protect = (ptr >= m_gapend() - m_gaplen()) && (ptr < m_gapend());
no_debug("protect: ptr 0x%p within gap 0x%p..0x%p? %d", ptr, m_gapend() - m_gaplen(), m_gapend(), want_protect);
        return want_protect? *new (ptr) GapProtect<T>(): *new (ptr) NoGap<T>();
    }
#endif //0
//adjust ptr before returning it to caller (skips over gap):
//retval to caller should be read-only; use GapProtect<> if caller wants to write
//    static const T* fixup(const T* ptr)
    /*inline*/ /*const*/ T*& fixup()
    {
//        if (!isgap()) return;
        if (m_ptr != m_gapend()) return m_ptr;
//if (want_debug) debug("fixup? %d, old ptr@ %d:0x%p, new ptr@ 0x%p, new gap@ 0x%p", m_ptr == m_gapend(), sizeof(m_ptr), m_ptr, m_ptr - m_gaplen(), m_gapend() + m_rowlen());
//            m_nextgap = m_ptr + m_rowlen + m_gaplen;
        m_gapend() += m_padlen() + m_rowlen();
        return m_ptr += m_padlen() - m_gaplen();
    }
};
#if 0
//optimized for gap len 1:
template<typename T, int TAG = __LINE__>
class Gap1Ptr: public GapPtr<T, TAG>
{
    using SUPER = GapPtr<T, TAG>;
public:
    Gap1Ptr(T* ptr, int rowlen): SUPER(ptr, rowlen, 1) {}
//    ~Gap1Ptr() {}
    Gap1Ptr(const Gap1Ptr& that): SUPER(that) {} //avoid [-Weffc++] warning
private:
    Gap1Ptr(T* that): SUPER(that) {} //avoid [-Weffc++] warning
public:
    /*inline*/ /*GapPtr&*/ void gapsave(const T& that) //equiv to "*ptr++ = val";
    {
static int count = 0;
if (!count++) debug(GREEN_MSG "gap1");
//TODO: why does m_ptr need to be qualified with SUPER::?
        if (SUPER::m_ptr != SUPER::m_gapend() - 1) RETURN(*SUPER::m_ptr++ = that);
#if 1 //debug
//if (want_debug) debug("gapsave: ptr@ %d:0x%p, gap@ 0x%p..0x%p '%'lu", sizeof(m_ptr), m_ptr, m_gapend() - m_gaplen(), m_gapend(), m_gapend() - m_ptr);
        if (RGBbits(that)) errmsg("attempt to store RGB data 0x%x in storage gap@ 0x%p", that, SUPER::m_ptr);
#endif //1
        SUPER::m_gapend() += SUPER::m_rowlen();
//        return *this;
    }
};
#endif
//template<typename T, int TAG = __LINE__>
//GapPtr<T, TAG>& mkGapPtr(T* ptr, int rowlen, int gaplen)
//{
//    return (gaplen == 1)? *new Gap1Ptr<T, TAG>(ptr, rowlen): *new GapPtr<T, TAG>(ptr, rowlen, gaplen);
//}
#if 0 //unit test
int main()
{
debug(PINK_MSG "main ...");
    int ary[3][6] = {1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18};
//    const int[3][4]& arf = ary; //https://stackoverflow.com/questions/31179355/passing-by-constant-reference-in-the-lambda-capture-list
    auto dump_ary = [&ary]() -> void //CAUTION: capture by ref to avoid creating ary copy
    {
        char buf[10 * sizeof(ary) / sizeof(ary[0][0]) + 2] = "";
        for (int i = 0; i < sizeof(ary) / sizeof(ary[0][0]); ++i)
            snprintf(buf + strlen(buf), sizeof(buf) - strlen(buf), ", %d", ary[0][i]);
debug("ary@ 0x%p..0x%p 0x%lx: %s", &ary[0][0], &ary[3][0], sizeof(ary), buf + 2);
    };
dump_ary();
    const int gap = 1; //2;
//    enum { here = __LINE__ };
//    GapPtr<int, here> gp(&ary[0][0], 4, gap);
//    Gap1Ptr<int, here> gp1(&ary[0][0], 4);
//    GapPtr<int, here>& ptr = (gap == 1)? gp1: gp; //ptr = new Gap1Ptr<int>(&ary[0][0], 4);
//    GapPtr<int, here>& ptr = (gap == 1)? *new Gap1Ptr<int, here>(&ary[0][0], 4): *new GapPtr<int, here>(&ary[0][0], 4, gap);
//    auto ptr = mkGapPtr<int>(&ary[0][0], 4, gap);
    GapPtr<int> ptr(&ary[0][0], 4, gap, 2);
//    if (gap == 1) new (&ptr) Gap1Ptr<int>(&ary[0][0], 4); //streamline
    for (int i = 1; i <= 2 * (4 + gap) + 2; ++i) { debug("ary[%d] 0x%p <- %d", i, &*ptr, 100 + i); ptr.gapsave(100 + i); } //*ptr++ = 100 + i; }
dump_ary();
debug("ary@ 0x%p, ptr end@ 0x%p == ary[%'lu], gap %d", &ary[0][0], &*ptr, ptr - &ary[0][0], gap);
    return 0;
}
#define main  other_main //avoid conflict with other main()
#endif //0


#if 0 //debug
#include <map>

template<typename T, size_t MAXSIZE = 0>
class FakePtr
{
    T* m_ptr;
    std::map<T*, T> m_values;
public:
    FakePtr(T* ptr = 0): m_ptr(ptr) {}
//    FakePtr& operator++() { FakePtr copy = *this; ++m_ptr; return copy; } //pre-inc
    FakePtr& operator++(int) { ++m_ptr; return *this; } //post-inc
    FakePtr& operator--() { --m_ptr; return *this; } //pre-dec
//    FakePtr operator--(int) { FakePtr copy = *this; --m_ptr; return copy; }; //post-dec
//    T* operator->() { return m_values[m_ptr]; } //faked memory; alloc as needed
    T& operator*() //faked memory; alloc as needed
    {
        bool toobig = MAXSIZE && (m_values.find(m_ptr) == m_values.end()) && (m_values.size() >= MAXSIZE);
        return m_values[toobig? (T*)-1: m_ptr];
    }
    size_t operator-(T* rhs) const { return m_ptr - rhs; }
public:
    void dump() const
    {
        for (const auto& it: m_values)
            if (it.second)
                if (it.first == (T*)-1)
                    debug("fake mem[.../%'lu] = 0x%x", MAXSIZE, it.second);
                else
                    debug("fake mem[0x%p/%'lu] = 0x%x", it.first, MAXSIZE, it.second);
    }
};
#endif //0

//compile-time loop:
//partial template specialization !allowed inside class :(
//partial function specialization also !allowed? :(
#if 0
template<typename TO_T, typename FROM_T, int N>
inline void ccp_copy(TO_T& to, const FROM_T& from)
{
    ccp_copy<N - 1>(to, from);
    to[N - 1] = from[N - 1];
}
//specialize to exit loop:
template<typename TO_T, typename FROM_T, 0>
inline void ccp_copy(TO_T& to, const FROM_T& from) { }
//#else
//work-around: overload parameter list
template<typename TO_T, typename FROM_T, int N>
inline void ccp_copy(TO_T& to, const FROM_T& from, /*int i,*/ UniqTag<N>)
{
    ccp_copy(to, from, UniqTag<N - 1> {});
    to[N - 1] = from[N - 1];
}
//specialize to exit loop:
template<typename TO_T, typename FROM_T>
inline void ccp_copy(TO_T& to, const FROM_T& from, /*int i,*/ UniqTag<0>) { } //noop
#endif //0


//24-bit pivot:
//"rotates" 24 independent channels of pixel data into one 24-bit parallel output stream, manifested as 24-bit RGB values on "screen"
//universe length is determined by hres * vres (fps)
//RPi GPU is not fast enough for 24 memory accesses per pixel, so CPU must do the pivot :(
//RPi CPU is not that fast either, so a smaller number of screen pixels is better
//NOTE: RGB bit/byte order doesn't matter - just swap channels/planes to make correction

//separate memory-mapped pixels into bit planes:
//1 plane (channel) per RGB bit, 24 RGB bits
//#define WANT_SHADOW //shadow fb
class Pivot24: public FBPixels
{
    NAPI_START_EXPORTS(Pivot24, FBPixels);
    enum { B2b = 8}; //8 bits/byte
public:
    enum { NUMCH = 24}; //fixed limit; uses all RGB bits
    enum { CACHELEN = 64}; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both
    enum { NULLPX = 3}; //kludge: give GPIO a few usec to settle before sending data; CAUTION: must be a multiple of 3 for WS281x
    using data_t = uint32_t; //uint8_t; //use quad bytes to allow denser indexing
    using col_t = ary<Pivot24, data_t>;
    using row_t = ary<Pivot24, col_t, data_t>;
private:
    FBPixels m_shadowFB; //copy pixels to another screen/window
    const size_t m_chqbytes; //#quadbytes/channel
public:
    static data_t* /*const*/ m_chdata; //CAUTION: pivot buf != pixel buf; pivot buf uses separated bit-channels
private:
//    static inline data_t*& m_chdata(data_t* ptr) { return m_chdata() = ptr; }
//    static inline data_t*& m_chdata() { static data_t* chdata; return chdata; }
    const int m_skipcols; //#imaginary columns to skip each line
//need to be able to switch pxrender after instantiation (based on ppb results)
//pass func ptrs manually rather than trying to use virt funcs and recasting
//can't get member function working; try static function instead:
//broken    /*virtual*/ static size_t rowlen_init(const FB::screeninfo_t* scrinfo); //m_chqbytes_init() //decltype needs fwd ref :(
//    using rowlen_init_t = decltype(&Pivot24::rowlen_init); //NULL_OF(Pivot24)->rowlen_init());
//    typedef size_t (Pivot24::*rowlen_init_t)(void);
    typedef size_t (*rowlen_init_t)(const CFG::screeninfo_t*); //allow custom px buf init
    rowlen_init_t m_rowlen_init; //save in case need to re-init
    typedef /*static*/ void (*pxrender_t)(int&, int, GapPtr</*FBPixels::*/color_t>&, data_t[NUMCH]); //SIZEOF(bitmasks)])
    pxrender_t m_pxrender;
//    static std::atomic<uint32_t> m_ready;
//    static std::atomic<int> m_frnum;
//    using ready_t = std::atomic<uint32_t>;
//    static inline ready_t& m_ready(int newr) { return m_ready() = newr; }
//    static inline ready_t& m_ready() { static ready_t ready; return ready; } //wker (channel) ready flags
//    using frnum_t = std::atomic<int>;
//    static inline frnum_t& m_frnum(int newf) { return m_frnum() = newf; }
//    static inline ready_t& m_frnum() { static frnum_t frnum; return frnum; } //wker (channel) ready flags
//public:
//    using ready_t = uint32_t; //std::atomic<uint32_t>;
//    static inline ready_t& m_ready(int newr) { return m_ready() = newr; }
//    static inline ready_t& m_ready() { static ready_t ready; return ready; } //wker (channel) ready flags
//    static /*ready_t*/ std::atomic<ready_t> m_ready; //wker (channel) ready flags
    static MultiSync<uint32_t> m_ready;
    using ready_value_t = decltype(m_ready)::value_t;
//    using frnum_t = int; //std::atomic<int>;
//    static inline frnum_t& m_frnum(int newf) { return m_frnum() = newf; }
//    static inline frnum_t& m_frnum() { static frnum_t frnum; return frnum; } //wker (channel) ready flags
//    static /*std::atomic<frnum_t>*/ int m_frnum; //current frame# for wkers
    static MultiSync<int> m_frnum; //NOTE: caller can use this for id, time, etc.
    using frnum_value_t = decltype(m_frnum)::value_t;
public: //ctor/dtor
//    typedef size_t (Pivot24::*rowlen_init_t)();
//    Pivot24(/*int fd = 0,*/ rowlen_init_t rlinit = &Pivot24::rowlen_init): FBPixels(/*fd*/), m_chqbytes((*rlinit)()), m_chdata(isOpen()? new data_t[NUMCH * m_chqbytes]: 0), channels(*(/*std::remove_reference<channels>::type*/row_t*)m_chdata)
    Pivot24(): Pivot24(CFG::any().fb()) {}
#pragma message(TODO: if !isMain then !open fb?)
    Pivot24(int fb, rowlen_init_t rlinit = &rowlen_init, pxrender_t pxrender = &pxrender): FBPixels(fb), m_shadowFB(-1), m_chqbytes((*rlinit)(&m_scrinfo)), /*m_chdata(isOpen()? new data_t[NUMCH * m_chqbytes]: 0),*/ m_skipcols(scrv.xtotal() - scrv.xres), m_rowlen_init(rlinit), m_pxrender(pxrender), channels(*(/*std::remove_reference<channels>::type*/row_t*)(isOpen()? new data_t[NUMCH * m_chqbytes]: 0)/*m_chdata*/)
//    Pivot24(/*int fd = 0*/): FBPixels(/*fd*/), m_chqbytes(rowlen_init()), m_chdata(isOpen()? new data_t[NUMCH * m_chqbytes]: 0), channels(*(/*std::remove_reference<channels>::type*/row_t*)m_chdata)
//    template<typename ... ARGS>
//    Pivot24(/*int fd = 0,*/ARGS&& ... args): FBPixels(/*fd*/), m_chqbytes(std::forward<ARGS>(args) ...), m_chdata(isOpen()? new data_t[NUMCH * m_chqbytes]: 0), channels(*(/*std::remove_reference<channels>::type*/row_t*)m_chdata)
    {
        clear_error();
        m_frnum = m_ready = 0; //wkers can start on first frame immediatlely
        /* *(data_t**)&*/ m_chdata = &channels[0][0]; //isOpen()? new data_t[NUMCH * m_chqbytes]: 0; //NOTE: static member must be init here, can't be inline with delegated ctors; kludge: bypass "const"
        if (!m_chdata) RETURN(errmsg("alloc channel bytes"));
//NOTE: must be set before using pixels.at()
        row_t::m_limit = col_t::m_limit = m_chdata + NUMCH * m_chqbytes;
        row_t::m_len = NUMCH;
        col_t::m_len = m_chqbytes;
        debug("Pivot24 ctor: alloc %'u xtotal * %'u yres / %lu qbytes = %'lu bytes/channel = %'lu bytes total @0x%p, #skipcols %'d, isopen? %d, ismain? %d", scrv.xtotal(), scrv.yres, sizeof(m_chdata[0]) * B2b, m_chqbytes * sizeof(data_t), NUMCH * m_chqbytes * sizeof(data_t), m_chdata, m_skipcols, isOpen(), !thrinx());
    }
    ~Pivot24() { if (m_chdata) delete m_chdata; debug(RED_MSG "TODO: plnew channels <- 0?"); } //m_chdata = 0; }
    Pivot24(const Pivot24& that): Pivot24(that.fb()) {} //avoid [-Weffc++] warning
    Pivot24& operator=(const Pivot24& that) { new (this) Pivot24(that.fb()); return *this; } //avoid [-Weffc++] warning
private: //ctor helpers (member init)
    inline void openfb(int fb) //need to re-init
    {
//no        SUPER::openfb(fb, true); //caller wants to update pixels; set visible
//        close();
        this->~Pivot24(); //dtor
        new (this) Pivot24(fb, m_rowlen_init); //use placement new to re-init with different fb
    }
//g++ gives "cannot be overloaded" error with fwd ref, so move actual func def to here as work-around
    /*virtual*/ static size_t rowlen_init(const CFG::screeninfo_t* scrinfo) //m_chqbytes_init()
    {
//summary: total screen/window width (incl hblank) * vis screen/window height (excl vblank) / 32 = #quadbytes/channel needed
        clear_error();
//debug("Pivot24::rowlen_init()");
//        auto scrinfo = screeninfo();
        if (!scrinfo->var.pixclock) return errmsg(1, "no bit clock");
//NOTE: hblank counts because it interleaves visible data (bits will be 0 during hblank); vblank !counted because occurs at end of frame
//        size_t xtotal = scrinfo->var.left_margin + scrinfo->var.xres + scrinfo->var.right_margin + scrinfo->var.hsync_len;
//CAUTION: need to round *down* to avoid mmap ovfl
//        size_t chqbytes_pad = (divup(divup(scrinfo->var.xtotal() * scrinfo->var.yres, sizeof(m_chdata[0]) * B2b) * sizeof(m_chdata[0]), CACHELEN) * CACHELEN) / sizeof(m_chdata[0]); //bits -> quadbytes; minimize cache contention for mult-threaded apps
        size_t chqbytes_pad = (scrinfo->var.xtotal() * scrinfo->var.yres - NULLPX) / std::lcm(sizeof(m_chdata[0]) * B2b, (int)CACHELEN); //bits -> quadbytes; minimize cache contention for mult-threaded apps
#if 0 //removed target limit; WS281x supercedes it
        constexpr int ws_usec = 30; //30 usec/WS281x node
        constexpr int ws_bits = 24; //24 data bits/WS281x node
        constexpr int ppb = 8; //desired #pixels to represent 1 data bit
        constexpr int limit = 1e6 / 20 / ws_usec * ws_bits * ppb; //target limit ~ 1667 WS281x 24-bit nodes @20 fps, render each data bit with 8 px => 320k px/channel/frame = 40KB/ch/fr
        int kludge = psec2KHz(scrv.pixclock); //printf shows wrong value (bad optimization?); store in separate var to help it
debug("Pivot24 chqbytes: (hres %'d + hblank %'d) * vres %'d = %'d bit times/ch/fr = %'d bytes/ch/fr, pad^ %'d => %'lu bytes/channel, target limit %'d bit times/ch/fr (%'d bytes), bit clk %'d psec (%'d KHz)", scrv.xres, scrv.xtotal() - scrv.xres, scrv.yres, scrv.xtotal() * scrv.yres, scrv.xtotal() * scrv.yres / sizeof(m_chdata[0]) / B2b, CACHELEN, scrv.xtotal() * scrv.yres / std::lcm(sizeof(m_chdata[0]) * B2b, CACHELEN), limit, divup(limit, B2b), scrv.pixclock, kludge); //psec2KHz(scrv.pixclock));
        if (!chqbytes || (chqbytes * sizeof(data_t) * B2b > limit)) /*return errmsg(99,*/ errmsg(YELLOW_MSG "channel bitmap length %'lu bytes out of expected range (0 .. %'d)", chqbytes * sizeof(data_t) * B2b, limit);
#endif //0
        return chqbytes_pad;
    }
public: //properties
    NAPI_EXPORT_PROPERTY(Pivot24, fb, openfb);
    inline int numch() const { return NUMCH; }
    NAPI_EXPORT_PROPERTY(Pivot24, numch);
    inline int bitclk() const { return scrv.pixclock; } //psec
    NAPI_EXPORT_PROPERTY(Pivot24, bitclk);
    size_t chbits() const { return m_chqbytes * sizeof(m_chdata[0]) * B2b; } //NOTE: could be padded
    NAPI_EXPORT_PROPERTY(Pivot24, chbits);
    inline int shadowfb() const { return m_shadowFB.fb(); }
    void shadowfb(int shfb) { m_shadowFB.openfb(shfb); } //, true); }
    NAPI_EXPORT_PROPERTY(Pivot24, shadowfb, shadowfb);
//thread sync:
//use frame timestamp rather than frame# (allows variable frame rates)         
//    inline decltype(m_frnum) frnum() const { return m_frnum; } //static -> instance shim
//    inline void frnum(decltype(m_frnum) newf) { m_frnum = newf; }
//    NAPI_EXPORT_PROPERTY(Pivot24, frnum);
    inline frnum_value_t frnum() const { return m_frnum; } //static -> instance shim
    inline void frnum(frnum_value_t newf) { m_frnum = newf; }
    NAPI_EXPORT_PROPERTY(Pivot24, frnum, frnum);
    inline ready_value_t ready() const { return m_ready; } //static -> instance shim
    inline void ready(ready_value_t newr) { if (newr) m_ready |= newr; else m_ready = newr; } //turn some bits on (wker threads) or all bits off (main thread) + notify waiting threads
    NAPI_EXPORT_PROPERTY(Pivot24, ready, ready);
    inline decltype(m_ready.age()) ready_age() const { return m_ready.age(); }
    NAPI_EXPORT_PROPERTY(Pivot24, ready_age);
//    inline decltype(::thrid()) thrid() const { return ::thrid(); }
//    NAPI_EXPORT_PROPERTY(Pivot24, thrid);
    inline decltype(::thrinx()) thrinx() const { return ::thrinx(); }
    NAPI_EXPORT_PROPERTY(Pivot24, thrinx);
public: //methods
    row_t& channels; //2D channel byte array access; at() bounds check, "[]" no bounds check
    inline bool inbounds(size_t ch, size_t ofs) const { return((ch < NUMCH) && (ofs < m_chqbytes)); }
    inline size_t xyinx(size_t ch, size_t ofs) const { return(inbounds(ch, ofs)? ch * m_chqbytes + ofs: NUMCH * m_chqbytes); } //CAUTION: invalid index should also fail bounds check, but should still allow use as upper limit
    inline data_t& chqbyte(size_t ch, size_t ofs, data_t bits) { dirty(true); return chqbyte(ch, ofs) = bits; } //rd/wr
    inline data_t& chqbyte(size_t ch, size_t ofs) { return channels.at(ch).at(ofs); }
    inline data_t& chqbyte(size_t ofs) { return channels[0].at(ofs); } //return(inbounds(ofs)? m_px[ofs]: m_dummy); } //rd/wr
//TODO: extend 3D ary to bit level? (to allow chaining)
    bool chbit(size_t ch, size_t ofs, bool bit) //rd/wr; not fluent
    {
        const data_t MSB = 0x80000000;
        if (bit) chqbyte(ch, ofs / 32) |= MSB >> (ofs % 32);
        else chqbyte(ch, ofs / 32) &= ~(MSB >> (ofs % 32));
        dirty(true);
        return bit; //TODO: fluent?
    }
    inline bool chbit(size_t ch, size_t ofs) { return (chqbyte(ch, ofs / 32) >> (31 - (ofs % 32))) & 1; }
#ifdef USING_NAPI
    Napi::Value chbit_method(const Napi::CallbackInfo& info)
    {
        const auto y = info[0].As<Napi::Number>().Int32Value();
        const auto x = info[1].As<Napi::Number>().Int32Value();
//        size_t ixy = xyinx(y, x);
//help caller to debug indexing errors (assumes low bandwidth):
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber() || /*(ixy == (size_t)-1) ||*/ ((info.Length() > 2) && !info[2].IsNumber())) return err_napi(info.Env(), "ch 0..%'d, ofs 0..%'d, optional bits (all Numbers) expected, got %d %s", NUMCH - 1, m_chqbytes *sizeof(data_t) * B2b - 1, info.Length(), "(TODO: napi type)");
        if (info.Length() > 2)
        {
            const auto bitval = info[2].ToNumber().Uint32Value(); //As<Napi::Number>().Uint32Value();
//debug("color 0x%x", color);
            chbit(y, x, bitval);
//            dirty(true);
        }
        return Napi::Number::New(info.Env(), chbit(y, x));
    }
    NAPI_EXPORT_METHOD(Pivot24, "chbit", chbit_method);
    Napi::Value chqbyte_method(const Napi::CallbackInfo& info)
    {
        const auto x = info[0].As<Napi::Number>().Int32Value();
        const auto y = info[1].As<Napi::Number>().Int32Value();
        size_t ixy = xyinx(x, y);
//help caller to debug indexing errors (assumes low bandwidth):
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber() || (ixy == (size_t)-1) || ((info.Length() > 2) && !info[2].IsNumber())) return err_napi(info.Env(), "ch 0..%'d, delay 0..%'d, optional bits (all Numbers) expected, got %d %s", NUMCH - 1, m_chqbytes - 1, info.Length(), "(TODO: napi type)");
        if (info.Length() > 2)
        {
            const auto bits = info[2].As<Napi::Number>().Uint32Value();
//debug("color 0x%x", color);
            chqbyte(ixy) = bits;
            dirty(true);
        }
        return Napi::Number::New(info.Env(), chqbyte(ixy));
    }
    NAPI_EXPORT_METHOD(Pivot24, "chqbyte", chqbyte_method);
//public:
//    Napi::Value ch2Dary_cached;
//CAUTION: intended for low bandwidth usage (due to high per-access overhead)
    Napi::Value channels_getter(const Napi::CallbackInfo &info)
    {
//CAUTION: caller is responsible for setting dirty flag
//        Napi::Env env = info.Env();
        int w = m_chqbytes, h = NUMCH;
        data_t* chbuf = &channels[0][0]; //(w * h); //NOTE: Javascript handles array bounds checking (with lengths given below); don't need to handle it in here
        if (!chbuf || !w || !h) return err_napi(info.Env(), "channel buffer broken");
//no worky :(        int iscached = (ch2Dary_cached.Env() == info.Env())? ch2Dary_cached.IsArray(): -2;
//debug("channels[%'d][%'d] getter, cached? %d", h, w, iscached);
//        if (iscached > 0) return ch2Dary_cached; //skip 2D array reconstruction
        auto arybuf = Napi::ArrayBuffer::New(info.Env(), chbuf, w * h * sizeof(*chbuf)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        auto retval = Napi::Array::New(info.Env(), h);
        for (uint32_t y = 0; y < h; ++y)
        {
            int len = /*y? w:*/ (h - y) * w; //allow caller to use linear addresses on any row
            auto rowary = Napi::TypedArrayOf<data_t>::New(info.Env(), len, arybuf, y * w * sizeof(*chbuf), napi_uint32_array); ////https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
//?            retval.set(y, rowary);
            retval[y] = rowary; //CAUTION: RPi needs y to be uint32_t
        }
//Buffer<t> Napi::Buffer<t>::New(env, data*, len);
//        ch2Dary_cached = retval;
//debug("now is it cached? %d, retval env? %d", (ch2Dary_cached.Env() == info.Env())? ch2Dary_cached.IsArray(): -2, retval.Env() == info.Env());
        return retval; //array of typed arrays
    }
    NAPI_EXPORT_WRAPPED_PROPERTY(Pivot24, "channels", channels_getter);
#endif //def USING_NAPI
    inline void fill() { fill(0); }
//    void fill(constexpr uint32_t argb) { fill(_t color(argb); debug("fill %'d px with 0x%x", m_numpx, color.uint32); for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color.uint32; }
//    void fill(constexpr uint32_t argb) { argb_t color(argb); debug("fill %'d px with 0x%x", m_numpx, color.uint32); for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color.uint32; }
    void fill(data_t bits) //CAUTION: overrides FB::fill
    {
static int count = 0;
        usec_t started = now_usec();
//        if (!bits || (bits == -1)) //special cases: all bits have same value
        bool allbytes = (bits == (bits & 0xFF) * 0x01010101);
        if (allbytes) //special cases: all bytes have same value
            memset(m_chdata, bits, NUMCH * m_chqbytes * sizeof(data_t));
        else for (size_t i = 0; i < NUMCH * m_chqbytes; ++i) m_chdata[i] = bits;
if (count++ < 3) debug("Pivot24 fill(0x%x) %'lu qbytes took %'u usec (excl refresh), special case? %d", bits, NUMCH * m_chqbytes, now_usec() - started, allbytes);
        dirty(true);
    }
#ifdef USING_NAPI
    Napi::Value fill_method(const Napi::CallbackInfo& info)
    {
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "bit mask (Number) expected, got %d %s", info.Length(), "(TODO: napi type)");
        const auto bits = info[0].As<Napi::Number>().Uint32Value();
        fill(bits); //updates pixel array in memory
        return info.Env().Undefined(); //Napi::Number::New(info.Env(), 0);
    }
    NAPI_EXPORT_METHOD(Pivot24, "fill", fill_method);
#endif //def USING_NAPI
#if 0 //wait for bits off:
    bool ready_wait(ready_value_t offbits)
    {
//        if (bits) //wait for bits off
//        else //wait for all bits on
//        static bool wait_for_value(VALTYPE val) { return m_val == val; }
//        m_ready.wait(bits? 0: -1, 
        return offbits? //(val == (decltype(val)-1))?
//            m_ready.wait(0, [offbits](ready_value_t ready) -> bool { return !(ready & offbits); }): //wker threads
//            m_ready.wait(-1); //wait for all bits on (main thread)
            m_ready.wait4bits0(offbits): //wait for bits off (wker threads)
            m_ready.wait4value(-1); //wait for all bits on (main thread)
    }
#endif//0
#ifdef USING_NAPI
    Napi::Value awaitready_method(const Napi::CallbackInfo& info)
    {
//debug("async method: #args %d, arg[0] %s", info.Length(), NapiType(info[0]));
        if (!info.Length() || !info[0].IsNumber()) return err_napi(info.Env(), "value/bits (1 Number) expected; got %d %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()));
//        const auto delay_msec = info[0].As<Napi::Number>().Int32Value();
        ready_value_t wait4val = /*info.Length()?*/ info[0].As<Napi::Number>().Int32Value();
        auto async_exec = [this, wait4val]() -> bool { return m_ready.wait4value(wait4val); }; //ready_wait(wait4bits); };
//debug("out(%'d), dirty? %d", delay_msec, dirty());
        NAPI_ASYNC_RETURN(async_exec);
    }
    NAPI_EXPORT_METHOD(Pivot24, "await_ready", awaitready_method);
//allow sync or async versions:
    template<bool ASYNC>
    Napi::Value awaitfrnum_method(const Napi::CallbackInfo& info)
    {
//debug("async method: #args %d, arg[0] %s", info.Length(), NapiType(info[0]));
        if (!info.Length() || !info[0].IsNumber() || (info.Length() > 2) || ((info.Length() > 1) && !info[1].IsNumber())) return err_napi(info.Env(), "1-2 values (Numbers) expected; got %d %s %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()), NapiType((info.Length() > 1)? info[1]: info.Env().Undefined()));
//        const auto delay_msec = info[0].As<Napi::Number>().Int32Value();
        frnum_value_t wait4frnum = /*info.Length()?*/ info[0].As<Napi::Number>().Int32Value();
        int cmp = (info.Length() > 1)? info[1].As<Napi::Number>().Int32Value(): 0;
        if (ASYNC)
        {
            auto async_exec = [this, wait4frnum, cmp]() -> bool { return m_frnum.wait4value(wait4frnum, cmp); };
//debug("out(%'d), dirty? %d", delay_msec, dirty());
            NAPI_ASYNC_RETURN(async_exec);
        }
        else //sync ret (blocking)
            return Napi::Number::New(info.Env(), m_frnum.wait4value(wait4frnum, cmp));
    }
//kludge: wrapper allows macro to use templated param:
    inline Napi::Value awaitfrnum_method_true(const Napi::CallbackInfo& info) { return awaitfrnum_method<true>(info); }
    inline Napi::Value awaitfrnum_method_false(const Napi::CallbackInfo& info) { return awaitfrnum_method<false>(info); }
    NAPI_EXPORT_METHOD(Pivot24, "await_frnum", awaitfrnum_method_true); //awaitfrnum_method<true>);
    NAPI_EXPORT_METHOD(Pivot24, "wait_frnum", awaitfrnum_method_false); //awaitfrnum_method<false>);
#endif //def USING_NAPI
//flush dirty channel data and wait:
    bool out_msec() { return out_msec(0); }
    bool out_msec(int msec)//, frnum_value_t nxtfr)
    {
#if 1
//        if (msec < 0) { m_ready.wait4value(-1); m_ready = 0; } //block until wker threads are done
//caller  addon
//render  idle
//        pivot
//        sync
//caller needs to block here until prev frame drawn
#pragma message("TODO: swap these? and/or stagger 24 block loading?")
        if (dirty()) pivot24(); //TODO: move to bg thread? doesn't seem to need it
//#pragma message(CYAN "TODO: ret to caller > pivot < sync")
//TODO: wake up caller here; can start working on next frame (for now, partially handled by async JS ret)
//        if (msec < 0) { m_frnum = divup(elapsed(), frtime()); } //unblock wker threads; auto-correct timing errors; NOTE: want *next* frame#, so round up elapsed time
        return (msec >= 0)? wait_msec(msec): false;
#else
//caller  addon
//render  idle
//        pivot
//render  sync
        acquire(); //caller needs to block here until prev frame drawn (protect pivoted buf)
        if (dirty()) pivot24(); //TODO: move to bg thread? doesn't seem to need it
//TODO: wake up caller here; can start working on next frame
        bg { wait_msec(msec); release(); }
        return;
#endif
    }
#ifdef USING_NAPI
    Napi::Value awaitout_method(const Napi::CallbackInfo& info)
    {
//debug("async method: #args %d, arg[0] %s", info.Length(), NapiType(info[0]));
        if (info.Length() && !info[0].IsNumber()) return err_napi(info.Env(), "milliseconds (1 Number) expected; got %d %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()));
//        const auto delay_msec = info[0].As<Napi::Number>().Int32Value();
        int delay_msec = info.Length()? info[0].As<Napi::Number>().Int32Value(): 0;
        constexpr int one_hr = 60 * 60 * 1e3; //msec
        if ((delay_msec < -one_hr) || (delay_msec > one_hr)) return err_napi(info.Env(), "delay %'d probably incorrect", delay_msec);
//debug("expected delay: min %'d, max %'d", -one_hr, one_hr);
        auto async_exec = [this, delay_msec]() -> bool { return out_msec(delay_msec); };
//debug("out(%'d), dirty? %d", delay_msec, dirty());
        NAPI_ASYNC_RETURN(async_exec);
    }
    NAPI_EXPORT_METHOD(Pivot24, "out", awaitout_method);
#endif //def USING_NAPI
    int debug_pivot() const { return m_debug_pivot; }
    void debug_pivot(int new_debug) { m_debug_pivot = new_debug; }
    NAPI_EXPORT_PROPERTY(Pivot24, debug_pivot, debug_pivot);
private: //helpers
//invalidate entire pivot cache:
//TODO: use dirty flag as 24/32-bit flag?
#if 0
    void need_pivot(bool yesno = true)
    {
        for (int x = 0; x < divup(W1, NUM_GPIO); ++x)
            for (int y = 0; y < H; ++y)
                dirty_pivot[x][y] = yesno;
    }
#endif //0
//undo R<->B swap during pivot:
//makes debug easier; no impact to live usage (just swap the wires)
//bit order is 0x80..1,0x8000..0x100,0x800000..0x10000 when red + blue swapped
#if 0 //all bits in order; better perf?
    template <int N>
    struct bitmasks { enum { bit = 1 << ((23 - N) % 8) }; }
#else
//allow explicit control of bit order (might be helpful for PCB routing):
protected:
    static constexpr int bitmasks[] = //each channel represents a different RGB bit
    {
        0x800000, 0x400000, 0x200000, 0x100000, 0x80000, 0x40000, 0x20000, 0x10000, //R7..R0
//        0x80, 0x40, 0x20, 0x10, 8, 4, 2, 1, //R7..R0
        0x8000, 0x4000, 0x2000, 0x1000, 0x800, 0x400, 0x200, 0x100, //G7..G0
//        0x800000, 0x400000, 0x200000, 0x100000, 0x80000, 0x40000, 0x20000, 0x10000, //B7..B0
        0x80, 0x40, 0x20, 0x10, 8, 4, 2, 1, //B7..B0
//            0 //dummy entry to allow trailing comma above (Javascript-like convenence)
    };
private:
    template <int N, typename T = void>
    CONSTDEF(bitmasks_OR, bits, bitmasks[N - 1] | bitmasks_OR<N - 1>::bits);
//        struct bitmasks_OR { enum { bits = bitmasks[N - 1] | bitmasks_OR<N - 1>::bits }; }
//#define loop_end  0, T //kludge: hide "," from cpp (messes up arg count)
    template<typename T>
    CONSTDEF(bitmasks_OR<0, T>, bits, 0); //end of recursive loop
//#undef loop_end
//        struct bitmasks_OR<0> { enum { bits = 0 }; } //end of recursive loop
//check that all RGB bits are accounted for:
//implicitly checks bitmasks[] size also
    static_assert(SIZEOF(bitmasks) == NUMCH, RED_MSG "bitmasks[] wrong size");
    static_assert(bitmasks_OR<SIZEOF(bitmasks)>::bits == RGBbits(::WHITE), RED_MSG "missing RGB bits in bitmasks[]" ENDCOLOR_NOLINE);
#endif //1
//kludge: CPU needs to do this for now; RPi GPU mem access too slow?
//NOTE: pivot src buf (chbuf) is 75% of pxbuf because it generates RGB, not A
//    virtual /*inline*/ void pxrender(int x, FBPixels::color_t*& px24ptr, data_t chqbits[SIZEOF(bitmasks)])
    /*virtual*/ static /*inline*/ void pxrender(int& want_debug, int xy, GapPtr</*FBPixels::*/color_t>& px24ptr, data_t chqbits[NUMCH]) //SIZEOF(bitmasks)])
    {
//        static constexpr int count = 0; //TODO: pass in?
//        int& m_debug_pivot = static_m_debug_pivot(); //kludge: create l-value
//        *px24ptr++ = pivot24; //1:1 24 qbits become 1 pixel (pivoted)
//        if (want_debug > 0) //show channel bits to pivot
        for (int ch = 0; ch < NUMCH; ++ch)
            if (chqbits[ch] && (want_debug-- > 0)) debug("to pivot: chqbits[ch %'d][xy %'d] = 0x%x", ch, xy, chqbits[ch]);
//        FBPixels::color_t* nextptr = px24ptr + 32;
//TODO: unwind loop at compile-time?
        for (uint32_t bit = 0x80000000; bit; bit >>= 1) //render all 32 bits
        {
//CAUTION: a lot of memory accesses here; could slow things down
//CAUTION: swapped bitmasks so channel 0..7 = R0..7, 8..15 = G0..7, 16..23 = B0..7
//makes addressing a little simpler in caller
            color_t px24 = //Abits(::WHITE) | //0xFF000000 |
                ((chqbits[0] & bit)? bitmasks[7- 0]: 0) |
                ((chqbits[1] & bit)? bitmasks[7- 1]: 0) |
                ((chqbits[2] & bit)? bitmasks[7- 2]: 0) |
                ((chqbits[3] & bit)? bitmasks[7- 3]: 0) |
                ((chqbits[4] & bit)? bitmasks[7- 4]: 0) |
                ((chqbits[5] & bit)? bitmasks[7- 5]: 0) |
                ((chqbits[6] & bit)? bitmasks[7- 6]: 0) |
                ((chqbits[7] & bit)? bitmasks[7- 7]: 0) |

                ((chqbits[8] & bit)? bitmasks[23- 8]: 0) |
                ((chqbits[9] & bit)? bitmasks[23- 9]: 0) |
                ((chqbits[10] & bit)? bitmasks[23- 10]: 0) |
                ((chqbits[11] & bit)? bitmasks[23- 11]: 0) |
                ((chqbits[12] & bit)? bitmasks[23- 12]: 0) |
                ((chqbits[13] & bit)? bitmasks[23- 13]: 0) |
                ((chqbits[14] & bit)? bitmasks[23- 14]: 0) |
                ((chqbits[15] & bit)? bitmasks[23- 15]: 0) |

                ((chqbits[16] & bit)? bitmasks[39- 16]: 0) |
                ((chqbits[17] & bit)? bitmasks[39- 17]: 0) |
                ((chqbits[18] & bit)? bitmasks[39- 18]: 0) |
                ((chqbits[19] & bit)? bitmasks[39- 19]: 0) |
                ((chqbits[20] & bit)? bitmasks[39- 20]: 0) |
                ((chqbits[21] & bit)? bitmasks[39- 21]: 0) |
                ((chqbits[22] & bit)? bitmasks[39- 22]: 0) |
                ((chqbits[23] & bit)? bitmasks[39- 23]: 0);
//if ((count < 3) && new24) debug("^%p ('%'lu) <- 0x%x", bp24, )
#if 1
//            if ((px24ptr < &pixels[0][0]) || (px24ptr >= &pixels[height()][0]))
//                RETURN(errmsg("pivot loop[%'d/%'d] bad: bp24 %px scrv. pixels@ %p..%p", x, m_chqbytes, px24ptr, px24));
            if (Abits(px24)) RETURN(clear_error(), errmsg("pivot turned on non-RGB bit: 0x%x", Abits(px24)));
//            if (m_debug_pivot && RGBbits(px24)) debug("pivoted qb[%'d]/px[%'d of %'d] = 0x%x doing bit 0x%x", x, px24ptr - &pixels[0][0], &pixels[NUMCH][0]) - &pixels[0][0], px24, bit);
            if ((want_debug > 0) && RGBbits(px24) && (want_debug-- > 0)) debug("qbyte[%'d] bit 0x%x = 0x%x", xy, bit, px24);
#endif //1
//if (new24 || (x == 7)) debug("loop[%'d/%'d]: ^%p++ (ofs %'d) = 0x%x", x, m_chqbytes, bp24, bp24 - &pixels[0][0], new24);
//TODO?            if (px24) ++non0s;
//            if (m_debug_pivot && px24) debug("pivot[%'d]: qb[%'d]/px[%'d] = 0x%x", count, x, px24ptr - &pixels[0][0], px24);
//            (*m_pxrender)(px24ptr, px24 | Abits(::WHITE));
//            if (px24 && px24.isgap()) warn("storing non-0 data 0x%x in storage gap@ %p", px24, /*(color_t*)*/px24ptr);
//            *px24ptr++ = px24 | Abits(::WHITE); //1:1 to output px (but pivoted); 24 channel bits are in RGB positions, set alpha so px will be displayed
            px24ptr.gapsave(px24 | Abits(::WHITE)); //*++; //1:1 to output px (but pivoted); 24 channel bits are in RGB positions, set alpha so px will be displayed
        }
    }
//    /*typedef*/ inline void (*m_pxrender)(FBixels::color_t* px24ptr, FBPixels::color_t pivot24);
//    using pxrender_t = decltype(NULL_OF(Pivot24)->pxrender(*NULL_OF(FBPixels::color_t), 0));
//    FBPixels::color_t* dummy_ptr; //kludge: decltype() wants params :(
//    using pxrender_t = decltype(&pxrender); //(dummy_ptr, 0));
//based on https://stackoverflow.com/questions/22291737/why-cant-decltype-work-with-overloaded-functions
//#define ARGTYPES(func)  \
//template<typename... ARGS>  \
//using TestType = decltype(func(std::declval<ARGS>()...))(ARGS...)
//    typedef /*inline*/ static void (::*pxrender_t)(FBPixels::color_t*& px24ptr, FBPixels::color_t pivot24);
#if 0 //too complicated:
//fb ptr info:
    struct PxPtr
    {
        const int m_width, m_skip; //#real, imaginary px/display line
        color_t* const firstpx; //first pixel to render
        color_t* const lastpx; //last pixel to render
        int col; //current display column; avoids need for "^ width()" each time
        color_t* bp24; //next pixel to render
//ctor:
        PxPtr(FBPixels& fb, int limit, int width, int skip): m_width(width), m_skip(skip), firstpx(&fb.pixels[0][0]), lastpx(fb.isOpen()? std::min(&fb.pixels[0][limit], &fb.pixels[fb.height()][0]): 0), col(0), bp24(fb.isOpen()? firstpx: 0) {}
//helpers:
        inline bool inbounds() const { return ((bp24 >= firstpx) && (bp24 < lastpx)); } //&pixels[0][m_chqbytes])) //out of bounds
        inline size_t atpx() const { return bp24 - firstpx; } //&pixels[0][0]
        inline size_t numpx() const { return lastpx - firstpx; }
        void wrap(int& want_debug, size_t rendered)
        {
            if (!m_skip) return; //don't need to adjust ptr
            int newcol = col + rendered;
            int pxwrap = newcol - m_width - m_skip; //#real pixels needing to be moved
            if (pxwrap >= 0) //wrapped to next display line; bump ptr back
            {
//                color_t* fixbp24 = bp24;
                if (pxwrap) //preserve real px values
                {
                    if (want_debug-- > 0)
                    {
                        bool diff = memcmp(bp24 - pxwrap - m_skip, bp24 - pxwrap, pxwrap * sizeof(*bp24));
                        debug("%'d/%'lu px wrapped: end@ 0x%p (%'lu y, %'d x), %s %'d px, new ptr@ 0x%p (%'lu y, %'d x)", pxwrap, rendered, bp24, (bp24 - firstpx) / m_width, newcol % m_width, diff? "slide by": "drop", -m_skip, bp24 - m_skip, (bp24 - m_skip - firstpx) / m_width, (newcol - m_skip) % m_width); //(bp24 - firstpx - pxwrap) % m_width);
                    }
                    memcpy(bp24 - pxwrap - m_skip, bp24 - pxwrap, pxwrap * sizeof(*bp24));
                }
                else if (want_debug-- > 0) debug("wrap pixels; ptr@ 0x%p (%'lu y, %'d x) => ptr@ 0x%p (%'lu y, %'d x)", bp24, (bp24 - firstpx) / m_width, col % m_width, bp24 - m_skip, (bp24 - m_skip - firstpx) / m_width, (newcol - m_skip) % m_width);
                bp24 -= m_skip;
                newcol -= m_skip;
            }
//            if ((col = newcol) >= m_width) col -= m_width;
            col = newcol;
        }
    };
#endif //0
protected:
//    pxrender_t m_pxrender; // = &pxrender;
//TODO: use STATIC_WRAP?
//    static int m_debug_pivot; //= 0;
    STATIC_WRAP(int, m_debug_pivot, = 0);
private:
//perf1: 130 msec -> 120 msec :(
//perf2: 130 msec -> 115 msec :(
//perf3: 130 msec -> 10 msec! :)
//perf1+3: 
    void pivot24()
    {
        static int count = -1; //only for debug
        ++count; //inc at start in case return out
//if (count < 3) debug("pivot[%'d] start", count);
//if (count < 3) debug("#qloop %'lu x 32 = %'lu bits = %'lu bytes = %'lu px", m_chqbytes, 32 * m_chqbytes, 4 * 32 * m_chqbytes, 4 * 32 * m_chqbytes / 3);
//if (count < 3) debug("chbuf@ %p, ch[0][0]@ %p, ch[24][0]@ %p, bitmask[0] 0x%x, bitmask[23] 0x%x", m_chdata, &channels[0][0], &channels[24][0], bitmasks[0], bitmasks[23]);
//using ptr_state = std::pair<int, size_t>; //color_t*>;
//std::vector<ptr_state> ptr_hist;
//ptr_state ptr_hist[10];
//size_t ptr_count = 0;
        usec_t started = now_usec();
//        int oldcol = 0; //oldline = (bp24 - &pixels[0][0]) / width();
//        color_t* bp24 = &pixels[0][0]; //start at top left
//        color_t* const endpx = std::min(&pixels[0][chbits()], &pixels[height()][0]); //bottom right limit, according to qbytes and screen geometry
//        const int unknown = 0; //kludge: don't know limit until first render
//        PxPtr pmy(*this, /*chbits()*/ unknown, width(), m_skipcols); //primary fb where px rendered
//        PxPtr shad(m_shadowFB, /*chbits()*/ unknown, width(), m_skipcols); //shadow fb to monitor/capture
        color_t& firstpx = pixels[0][0];
        const color_t& lastpx = pixels[height()][0]; //- &pixels[0][0];
//debug("isX? %d, xres %'d, xtotal %'d, rowlen %'d, gap %d, pad %d", isXWindows(), scrv.xres, xtotal(), rowlen(), xtotal() - scrv.xres, isXWindows()? rowlen() - xtotal(): rowlen() - scrv.xres);
        GapPtr<color_t> bp24(&firstpx, scrv.xres/*width()*/, /*scrv.xtotal() scrf.line_length / sizeof(m_px[0]*/ xtotal() - scrv.xres, /*isXWindows()? rowlen() - xtotal():*/ rowlen() - scrv.xres); //kludge: unpad gap for XWindows
        int pxpq; //#px generated per qbyte (32 for Pivot24, 72 for WS281x)
//    GapPtr<int> ptr(&ary[0][0], 4, gap);
//    if (gap == 1) new (&ptr) Gap1Ptr<int>(&ary[0][0], 4); //streamline
//    using GapPtr_1st =  enum { here = __LINE__ };
//    auto ptr = mkGapPtr<int>(&ary[0][0], 4, gap);
//        GapPtr<color_t>& bp24 = mkGapPtr<color_t>(&firstpx, scrv.xres/*width()*/, scrv.xtotal() - scrv.xres);
//        GapPtr<color_t, 2>& shadptr = mkGapPtr<color_t, 2>(/*m_shadowFB.isOpen()?*/ &shfirst, /*width()*/scrv.xres, scrv.xtotal() - scrv.xres);
//        int oldshcol = 0;
//        color_t* bpsh24 = m_shadowFB.isOpen()? &m_shadowFB.pixels[0][0]: 0;
//        color_t* const endshpx = m_shadowFB.isOpen()? std::min(&m_shadowFB.pixels[0][chbits()], &m_shadowFB.pixels[height()][0]): 0;
//        debug("px limit: ch[0][%'d] 0x%p vs px[%'d][0] 0x%p => 0x%p", chbits(), &pixels[0][chbits()], height(), &pixels[height()][0], endpx);
//        FakePtr<color_t, 64> bp24 = m_pixels;
//        int svcount = count++, want_debug = m_debug_pivot? m_debug_pivot--: 0; //ensure upd before return
//        size_t chqbytes_max = scrv.xres * scrv.yres / sizeof(m_chdata[0]) / B2b;
//        size_t chqbytes_limit = std::min(chqbytes_max, m_chqbytes);
        bool wanted_debug = (m_debug_pivot-- > 0); //show exit msg even if debug count runs out
        if (wanted_debug) debug("pivot[%'d], want debug? %d, nullpx %d, chqbytes %'lu, gap %d: %'u -> %'u, pad %lu: %'u -> %'lu", count, m_debug_pivot + 1, NULLPX, m_chqbytes, scrv.xtotal() - scrv.xres, scrv.xres, scrv.xtotal(), /*isXWindows()? rowlen() - xtotal():*/ rowlen() - scrv.xres, scrv.xres, rowlen()); // vs scr res %'lu px => limit %'lu, #px out limit %'lu = min(chbits %'lu, res %'lu)", count, m_debug_pivot + 1, m_chqbytes, chqbytes_max, chqbytes_limit, pmy.numpx(), chbits(), height() * width());
//int err_count = 0;
        for (int i = 0; i < NULLPX; ++i) bp24.nongapsave(0); //*bp24++ = 0;
        for (int xy = 0; xy < m_chqbytes; ++xy) //fill L2R, T2B
        {
//localize mem access by loading next block of 32 bits (perf):
            data_t chqbits[NUMCH]; //SIZEOF(bitmasks)]; //1 qbyte per channel
            for (int ch = 0; ch < NUMCH /*SIZEOF(chqbits)*/; ++ch) chqbits[ch] = channels[ch][xy];
//            {
//not this layer!                chqbits[ch] = LIMIT(channels[y][x]); //limit brightness
//                if (chqbits[y] != channels[y][x]) debug("limit brightness[%'d,%'d] 0x%x => 0x%x", x, m_chqbytes, y, SIZEOF(chqbits), channels[y][x], chqbits[y]);
//            }
//            if (m_debug_pivot) //show channel bits to pivot
//                for (int y = 0; y < SIZEOF(chqbits); ++y)
//                    if (chqbits[y]) debug("to pivot: chqbits[%'d][%'d] = 0x%x", y, x, chqbits[y]);
//ptr_hist.push_back(ptr_state(x, bp24 - &pixels[0][0]));
//if (ptr_count < 4) ptr_hist[ptr_count + 4] = ptr_state(x, bp24 - &pixels[0][0]);
//else ptr_hist[ptr_count & 3] = ptr_state(xy, bp24 - &pixels[0][0]);
//++ptr_count;
//            if ((bp24 < &pixels[0][0]) || (bp24 >= endpx)) //&pixels[0][m_chqbytes])) //out of bounds
            if (xy && (bp24 + pxpq > &lastpx)) //return;
            {
//                int s = ptr_count; //ptr_hist.size();
//                debug("x/ofs: %'d/%'lu, %'d/%'lu, %'d/%'lu, %'d/%'lu ... ", ptr_hist[4+0].first, ptr_hist[4+0].second, ptr_hist[4+1].first, ptr_hist[4+1].second, ptr_hist[4+2].first, ptr_hist[4+2].second, ptr_hist[4+3].first, ptr_hist[4+3].second);
//                debug("x/ofs: ... %'d/%'lu, %'d/%'lu, %'d/%'lu, %'d/%'lu", ptr_hist[(s+0)&3].first, ptr_hist[(s+0)&3].second, ptr_hist[(s+1)&3].first, ptr_hist[(s+1)&3].second, ptr_hist[(s+2)&3].first, ptr_hist[(s+2)&3].second, ptr_hist[(s+3)&3].first, ptr_hist[(s+3)&3].second);
//                RETURN(clear_error(), errmsg("pivot loop[%'d/%'d] bad: bp24@ 0x%p vs. pixels@ 0x%p..0x%p", xy, m_chqbytes, pmy.bp24, pmy.firstpx, pmy.lastpx)); //&pixels[0][m_chqbytes], ptr_count));
                clear_error();
                errmsg("pivot loop[xy %'d/%'d] bp24@ 0x%p + %'lu overruns pixels@ 0x%p..0x%p", xy, m_chqbytes, bp24, pxpq, &firstpx, &lastpx); //&pixels[0][m_chqbytes], ptr_count));
                break;
            }
            const color_t* oldbp24 = bp24;
            (*m_pxrender)(m_debug_pivot, xy, bp24, chqbits); //render (pivot) next block of px
//            int newline = (bp24 - &pixels[0][0]) / width();
//            int newcol = pmy.col + pmy.bp24 - oldbp24; //bp24 - &pixels[0][0]; //(bp24 - &pixels[0][0]) % width();
            size_t morepx = bp24 - oldbp24; //#pixels rendered for pivot block
            if (!xy) pxpq = morepx; //re-init with correct limit now that expected size is known
//            {
//limit is const member, so call ctor (placement new) to set it:
//                new (&pmy) PxPtr(*this, morepx * chqbytes_limit, width(), m_skipcols);
//                new (&shad) PxPtr(m_shadowFB, morepx * chqbytes_limit, width(), m_skipcols);
//            }
//if ((morepx != 32) && (morepx != 3*24)) //WS281x generates 72 px each time
//    if (++err_count < 10) errmsg("bad pxrender @xy %'d: 0x%p -> 0x%p = %lu qbytes", xy, oldbp24, pmy.bp24, morepx);
#if 0 //debug; perf3; THIS CODE SLOWS PERF BY 10X; DON'T USE
//NOTE: pxrender() knows about the RGB values being rendered, so it can check for stray bits
//here we just check the RGB bits for 0/non-0
            while (oldbp24 < bp24) //check new px values that were rendered
            {
                if (RGBbits(*oldbp24)) ++non0s;
                if (RGBbits(*oldbp24))
                    if ((m_pxrender == &pxrender) || (*oldbp24 != ::WHITE) || (rerow(oldbp24 - &firstpx, scrv.xres, scrv.xtotal()) % 3)) //kludge: don't report WS281x start bits; CAUTION: bp24 hasn't been wrapped yet, so apply %3 from bp24 back towards oldbp24
                        if (m_debug_pivot-- > 0) debug("pivot[%'d]: qb[%'d/%'lu]/px[%'lu/%'lu] = 0x%x, wh? %d, rerow ofs %'lu", count, xy, m_chqbytes, oldbp24 - &firstpx, &lastpx - &firstpx, *oldbp24, *oldbp24 == ::WHITE, rerow(oldbp24 - &firstpx, scrv.xres, scrv.xtotal()));
//                if (shadptr) //also copy to shadow fb
                if (shadptr < &shlast) shadptr.gapsave(*oldbp24); //*shadptr++ = *oldbp24;
                else ++shadptr;
                ++oldbp24;
            }
#endif //1
//CAUTION: px24 ptr needs to account for imaginary (hblank) pixels because they affect timing
//instead of alloc extra memory for imaginary pixels, just let ptr wrap to next display line and then bump it back to start of line after writing imaginary pixels:
// 0..xres..xtotal
// +-------+---+
// |       |iii|
// |III    |   |  imaginary pixels written at III, should be at iii but no memory is there
// +-------+   |
// |           |
// +-----------+
//color_t* prewrap = pmy.bp24;
//            pmy.wrap(m_debug_pivot, morepx); //check whether to adjust ptr for imaginary pixels
//color_t* postwrap = pmy.bp24;
//size_t delta = (prewrap < postwrap)? postwrap - prewrap: prewrap - postwrap;
//if (delta && (delta != 1))
//    if (++err_count < 10) errmsg("bad wrap @xy %'d: 0x%p -> 0x%p = %lu qbytes", xy, prewrap, postwrap, delta);
//            if (shad.bp24 && (shad.bp24 < shad.lastpx)) shad.wrap(m_debug_pivot, morepx);
            if (m_debug_pivot < -1000000000) m_debug_pivot = -1; //kludge: prevent wrap turning debug back on
        }
//        if (m_debug_pivot-- <= 0) return;
//        --m_debug_pivot; //auto turn off
//        usec_t elapsed = now_usec() - started;
//if (count < 3) debug("pivot[%'d]: px@ %p + %'lu qbytes => pxe@ %p (=+%'lu), %'lu msec", count, &pixels[0][0], m_chqbytes, bp24, bp24 - &pixels[0][0], elapsed);
        if (!wanted_debug) return; //m_debug_pivot-- > 0)
#if 1 //do this at end; gives poor perf on RPi when done inside above loop
        color_t& shfirst = m_shadowFB.isOpen()? m_shadowFB.pixels[0][0]: *NULL_OF(color_t); //- &pixels[0][0];
        const color_t& shlast = m_shadowFB.isOpen()? m_shadowFB.pixels[height()][0]: *NULL_OF(color_t); //- &pixels[0][0];
        GapPtr<color_t, 2> shadptr(/*m_shadowFB.isOpen()?*/ &shfirst, /*width()*/scrv.xres, /*scrv.xtotal()*/ xtotal() - scrv.xres, m_shadowFB.rowlen() - scrv.xres);
#pragma message(YELLOW_MSG "TODO: test shadow")
        int non0s = 0;
        const color_t* oldbp24 = &firstpx;
        while (oldbp24 < bp24) //check new px values that were rendered
        {
            if (RGBbits(*oldbp24)) ++non0s;
//                if (shadptr) //also copy to shadow fb
            if (shadptr < &shlast) shadptr.gapsave(*oldbp24); //*shadptr++ = *oldbp24;
            else ++shadptr;
            ++oldbp24;
        }
#endif
        debug("pivot[%'d]: px@ 0x%p + %'lu qbytes => ptr@ 0x%p (=+%'lu), %'lu trailing px, %'lu/%'lu shadow px (%s bounds), #non-0s %'d, %'u usec", count, &firstpx, m_chqbytes, (const void*)bp24, bp24 - &firstpx, &lastpx - bp24, shadptr - &shfirst, &shlast - &shfirst, (shadptr <= &shlast)? "in": "out of", non0s, now_usec() - started);
//if (count < 3) bp24.dump();
    }
    NAPI_STOP_EXPORTS(Pivot24); //public
};
NAPI_EXPORT_CLASS(Pivot24);
//CAUTION: static class members need init value in order to be found; overwrite later
//int Pivot24::m_debug_pivot = 0;
//TODO: STATIC_WRAP
//channel data:
template<> STATIC /*size_t*/ decltype(Pivot24::row_t::m_len) Pivot24::row_t::m_len = 0;
template<> STATIC /*Pivot24::data_t**/ decltype(Pivot24::row_t::m_limit) Pivot24::row_t::m_limit = 0;
template<> STATIC /*const char**/ decltype(Pivot24::row_t::item_type) Pivot24::row_t::item_type = "channel";
template<> STATIC /*size_t*/ decltype(Pivot24::col_t::m_len) Pivot24::col_t::m_len = 0;
template<> STATIC /*Pivot24::data_t**/ decltype(Pivot24::col_t::m_limit) Pivot24::col_t::m_limit = 0;
template<> STATIC /*const char**/ decltype(Pivot24::col_t::item_type) Pivot24::col_t::item_type = "channel qbyte";
//shared (wker) data:
STATIC /*Pivot24::data_t* const*/ decltype(Pivot24::m_chdata) Pivot24::m_chdata = 0;
STATIC decltype(Pivot24::m_frnum) Pivot24::m_frnum = decltype(Pivot24::m_frnum)(0);
STATIC decltype(Pivot24::m_ready) Pivot24::m_ready = decltype(Pivot24::m_ready)(0); //https://stackoverflow.com/questions/20453054/initialize-static-atomic-member-variable


///////////////////////////////////////////////////////////////////////////////
////
/// WS281X protocol formatter
//

//generate WS281X data signal:
//for explanation of 3x bit rate with NRZ, see https://github.com/jgarff/rpi_ws281x
//https://wp.josh.com/2014/05/13/ws2812-neopixels-are-not-so-finicky-once-you-get-to-know-them/
//https://learn.adafruit.com/adafruit-neopixel-uberguide/basic-connections
//https://learn.adafruit.com/adafruit-neopixel-uberguide/best-practices
//works similar to Pivot24, but implements WS281x protocol:
//- formats bit data (adds bit start + stop) into data stream (3 px/bit)
//- 24 bits per node
//NOTE: vblank interval serves as 50 usec WS281x refresh signal
//for YALP, also adds frame# and checksum into data stream
//NOTE: theoretically could be layered on top of Pivot24, but due to limited RPi resources (mem + CPU speed), this is a customized/slimmed down version of Pivot24 instead
//template <int PPB>
class WS281x: public Pivot24
{
    NAPI_START_EXPORTS(WS281x, Pivot24);
    enum { WSBITS = 24 }; //predetermined by protocol; 24 bits/node
//    static constexpr int WSBITS = 24; //predetermined by protocol; 24 bits/node
    enum { WSTIME = 30 }; //predetermined by WS281x protocol; 30 usec/wsnode
//    static constexpr double WSTIME = 30e-6; //predetermined by WS281x protocol; 30usec/wsnode
//    enum { PPB = 8}; //use 8 px to render each WS281x data bit
//public:
    using wsnode_t = Pivot24::data_t; //uint32_t; //RGB color for each WS281x node; top 8 bits ignored - could be used for app-level blending
//    using col_t = ary<WS281x, wsnode_t>;
//    using row_t = ary<WS281x, col_t, wsnode_t>;
//    color_t m_startbits, m_stopbits; //make it easier to debug hi res or small screens; also allows individual channels to be disabled
    static inline color_t& m_startbits(int newbits) { return m_startbits() = newbits; }
    static inline color_t& m_startbits() { static color_t startbits; return startbits; }
    static inline color_t& m_stopbits(int newbits) { return m_stopbits() = newbits; }
    static inline color_t& m_stopbits() { static color_t stopbits; return stopbits; }
    static inline int*/*[NUMCH]*/ m_maxbright(int newmaxb) { for (int i = 0; i < NUMCH; ++i) m_maxbright()[i] = newmaxb; return m_maxbright(); } //set for all channels
    static inline int*/*[NUMCH]*/ m_maxbright() { static int maxbright[NUMCH]; return maxbright; }
//private:
////TODO: use STATIC_WRAP?
//    static int m_ppb; //#px used to render each WS281x data bit
//    STATIC_WRAP(int, m_ppb, = 0); //kludge: univlen_init() is static so this must be also
//    size_t& m_univlen = Pivot24::m_chqbytes; //#WS281x nodes/channel; channel == "universe"
//    color_t*& m_wsdata = Pivot24::m_chdata; //CAUTION: pivot buf != pixel buf
//    size_t m_chqbytes; //#quadbytes/channel
//    size_t m_univlen; //same as Pivot24::m_chqbytes but that's marked private so keep a copy here
//    data_t* m_chdata; //CAUTION: pivot buf != pixel buf
//    static size_t univlen_init_shim(const FB::screeninfo_t* scrinfo)
//    {
//debug("univlen_init_shim");
//        return 100;
//    }
//    typedef size_t (WS281x::*my_rowlen_init_t)();
//    my_rowlen_init_t myinit = &WS281x::univlen_init;
//    Pivot24::rowlen_init_t cast_init = (Pivot24::rowlen_init_t)&WS281x::univlen_init;
public: //ctor/dtor
//    WS281x(/*int fd = 0*/): Pivot24(/*fd,*/ (Pivot24::rowlen_init_t)&WS281x::univlen_init) {} //, univlen_init(), (m_ppb == 8)? wsrender_8ppb: 0)
    WS281x(): WS281x(CFG::any().fb()) {}
    WS281x(int fb): Pivot24(fb, &univlen_init, &pxrender_3ppb) //, univlen_init(), (m_ppb == 8)? wsrender_8ppb: 0)
    {
        m_startbits(::WHITE);
        m_stopbits(::BLACK);
        maxbright((0xFF + 0xFF + 0xFF) * 2/3); //3 * 0xAA); //default to 67% (max 40 mA/node)
        if (rowlen() != scrv.xres) errmsg("expected 0 pad len: rowlen %'d - xres %'d", rowlen(), scrv.xres);
    }
//    {
//        debug("WS281x ctor: alloc %'lu nodes/channel = %'lu bytes total", univlen(), NUMCH * univlen() * sizeof(wsnode_t));
//    }
private: //ctor helpers (member init)
    inline void openfb(int fb) //need to re-init
    {
//no        SUPER::openfb(fb, true); //caller wants to update pixels; set visible
//        close();
        this->~WS281x(); //dtor
        new (this) WS281x(fb); //use placement new to re-init with different fb
    }
//    virtual size_t rowlen_init()
    /*virtual*/ static size_t univlen_init(const CFG::screeninfo_t* scrinfo) //m_chqbytes_init()
    {
        clear_error();
        enum { JUNKLEN = 10 }; //dummy return value
//        int& m_ppb = static_m_ppb(); //kludge: create l-value
        const decltype(scrinfo->var)& scrv = scrinfo->var; //reduce verbosity
debug("ws univlen init, pixclk %'u psec", scrv.pixclock);
//        auto scrinfo = screeninfo();
        if (!scrv.pixclock) return errmsg(JUNKLEN, "no bit clock"); //psec
//NOTE: hblank counts because it interleaves visible data (bits will be 0 during hblank); vblank !counted because occurs at end of frame
//        static constexpr int psec2usec = 1e6; //psec => usec
//        enum { psec2usec = 1000000 }; //psec => usec
//        static constexpr int modchk = 100; //scale up while checking fractions
        enum { modchk = 100 }; //scale up while checking fractional ppb
        enum { psec2usec = 1000000 };
//kludge: split 1e6 factor to avoid overflow
        int m_ppb = rdiv(modchk * WSTIME / WSBITS * psec2usec, scrv.pixclock); // / WSTIME * (scrv.pixclock * 1e3) / WSBITS;
//debug("mod %'d * p2u %'d * ws %d / ws %d / clk %'d = ppb %d", modchk, psec2usec, WSTIME, WSBITS, scrv.pixclock, m_ppb);
//        if (mod(WSTIME * scrv.pixclock * 1e3, WSBITS))
        if (m_ppb % modchk) errmsg(YELLOW_MSG "non-integral %3.2f px/bit could result in timing jitter", (double)m_ppb / modchk); //WSTIME * scrv.pixclock * 1e3 / WSBITS);
        if (scrv.xres & 1) errmsg(YELLOW_MSG "non-even xres can cause timing jitter (RPi GPU limitation)");
        m_ppb = rdiv(m_ppb, modchk); //scale back to true value
        if (m_ppb < 3) return errmsg(JUNKLEN, "ppb insufficient resolution to render WS281x data: %d", m_ppb);
//        if (ppb != PPB) return errmsg("wrong ppb: %'d usec wsnode time / %'d KHz bit clk => %'d ppb (compiled for %d", WSTIME, scrv.pixclock, ppb, PPB);
//        size_t xtotal = scrv.left_margin + scrv.xres + scrv.right_margin + scrv.hsync_len;
        size_t vblank = scrv.ytotal() - scrv.yres; //scrv.upper_margin + scrv.vsync_len + scrv.lower_margin;
//debug("%'d xtotal, %'d vblank", xtotal, vblank);
        size_t univlen_pad = (((scrv.xtotal() * scrv.yres - NULLPX) / WSBITS / m_ppb) * sizeof(wsnode_t) / CACHELEN) * CACHELEN / sizeof(wsnode_t); //bits -> bytes; minimize cache contention for mult-threaded apps
//        constexpr int limit = 1.0 / 20 / WSTIME; //target limit ~ 1667 WS281x 24-bit nodes @20 fps, render each data bit with 8 px => 320k px/channel/frame = 40KB/ch/fr
debug("WS281x univ: (hres %'u + hblank %'u) * vres %'u = %'u bit times/ch/fr = %'d wsnode/ch/fr @%'d px/bit, pad %'d bytes => %'lu wsnodes/channel, "
//    "target limit %'d wsnodes/ch/fr (%'d bytes), "
    "bit clk %'lu KHz (%'d psec), hblank = %2.1f ws bits, vblank = %'d usec", 
scrv.xres, scrv.xtotal() - scrv.xres, scrv.yres, scrv.xtotal() * scrv.yres, scrv.xtotal() * scrv.yres / WSBITS / m_ppb, m_ppb, CACHELEN, univlen_pad, 
//limit, limit * sizeof(wsnode_t), 
psec2KHz(scrv.pixclock), scrv.pixclock, (double)(scrv.xtotal() - scrv.xres) / m_ppb, (int)rdiv(scrv.xtotal() * vblank * scrv.pixclock, psec2usec));
//protocol limit: signal low (stop bit) must be < 50% data bit time
//this allows ws data stream to span hblank without interruption
        if (2 * (scrv.xtotal() - scrv.xres) >= m_ppb) warn("hblank (%'d px) too long: exceeds WS281x 50%% data bit time (%'d px)", scrv.xtotal() - scrv.xres, m_ppb);
        if (!vblank /*(xtotal * vblank) / scrv.pixclock / 1e3 < 50*/) warn("vblank (%'lu lines) too short: WS281x needs at least 50 usec (1 scan line)", vblank); //, 50e3 * scrv.pixclock / xtotal);
        if (scrv.xtotal() - scrv.xres != 1) errmsg("expected xtotal %'d = xres %'d + 1", scrv.xtotal(), scrv.xres);
//        if (rowlen() != scrv.xres) errmsg("expected 0 pad len: rowlen %'d - xres %'d", rowlen(), scrv.xres);
//        if (!univlen || (univlen > limit)) /*return errmsg(99,*/ errmsg(YELLOW_MSG "univ length %'lu nodes outside expected range (0 .. %'d)", univlen, limit);
//adjust render logic to match screen config:
#if 1 //standardize on 3 ppb (~= 2.4MHz SPI)
//        m_pxrender = &pxrender_3ppb;
        if (m_ppb == 3) return univlen_pad;
#else
        switch (m_ppb)
        {
            case 3: /*m_pxrender = &pxrender_3ppb;*/ return univlen_pad;
            case 8: /*m_pxrender = &pxrender_8ppb;*/ return univlen_pad;
            case 12: /*m_pxrender = &pxrender_8ppb;*/ return univlen_pad;
            case 19: /*m_pxrender = &pxrender_19ppb;*/ return univlen_pad; //dev only
//                if (FBIO::CFG.isRPi && !FBIO::CFG.isXWindows()) break;
        }
#endif // 1
        return errmsg(JUNKLEN, "unsupported ppb: %d", m_ppb); //use safe value 10
    }
//public: //properties
    NAPI_EXPORT_PROPERTY(WS281x, fb, openfb);
    size_t univlen() const { return &channels[1][0] - &channels[0][0]; } //m_univlen; } //m_chqbytes; } //NOTE: could be truncated
    NAPI_EXPORT_PROPERTY(WS281x, univlen);
//    size_t numch() const { return NUMCH; }
    inline color_t startbits() const { return m_startbits(); }
    inline void startbits(color_t newbits) { m_startbits(newbits); }
    NAPI_EXPORT_PROPERTY(WS281x, startbits, startbits);
    inline color_t stopbits() const { return m_stopbits(); }
    inline void stopbits(color_t newbits) { m_stopbits(newbits); }
    NAPI_EXPORT_PROPERTY(WS281x, stopbits, stopbits);
//public: //methods
//aliases:
    inline wsnode_t& wsnode(size_t ch, size_t ofs, wsnode_t color) { return chqbyte(ch, ofs, color); } //rd/wr
    inline wsnode_t& wsnode(size_t ch, size_t ofs) { return chqbyte(ch, ofs); }
    row_t& wsnodes = channels; //2D channel byte array access; at() bounds check, "[]" no bounds check
//#ifdef USING_NAPI
//    inline Napi::Value wsnode_method(const Napi::CallbackInfo& info) { return Pivot24::chqbyte_method(info); } //alias
    NAPI_EXPORT_METHOD(WS281x, "wsnode", chqbyte_method); //wsnode_method); //alias
    NAPI_EXPORT_WRAPPED_PROPERTY(WS281x, "wsnodes", channels_getter);
//#endif //def USING_NAPI
    inline int maxbright_rettype() const { return 3 * 0xFF; } //kludge: only used to set napi Export return type
    inline void maxbright(int newmaxb) { m_maxbright(clamp(newmaxb, 3 * 0xFF)); }
//    NAPI_EXPORT_PROPERTY(WS281x, maxbright, maxbright);
#ifdef USING_NAPI
    Napi::Value maxbright_getter(const Napi::CallbackInfo &info)
    {
        /*int[NUMCH]*/int* maxbr = m_maxbright();
        auto arybuf = Napi::ArrayBuffer::New(info.Env(), maxbr, NUMCH * sizeof(maxbr[0])); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        auto retval = Napi::TypedArrayOf<color_t>::New(info.Env(), NUMCH, arybuf, NUMCH * sizeof(maxbr[0]), napi_uint32_array); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
        return retval; //typed array of color_t
    }
//    NAPI_EXPORT_WRAPPED_PROPERTY(WS281x, "maxbright", maxbright_getter);
    NAPI_EXPORT_WRAPPED_PROPERTY_WITH_SETTER(WS281x, "maxbright", maxbright_getter, maxbright_rettype, maxbright);
#endif //def USING_NAPI
private: //helpers
//    color_t m_maxbright;
//212 == 83% limit; max 60 => 50 mA / LED
//170 == 67% limit; max 60 => 40 mA / LED
//128 == 50% limit: max 60 => 30 mA / LED
    inline static color_t limit(color_t color, int LIMIT3)
    {
        int r = R(color), g = G(color), b = B(color);
        int br = r + g + b; //brightness(color);
        if (br <= LIMIT3/*_BRIGHTNESS * 3*/) return color;
//    return toARGB(A(color), r, g, b);
        int dimr = r * LIMIT3/*_BRIGHTNESS * 3*/ / br;
        int dimg = g * LIMIT3/*_BRIGHTNESS * 3*/ / br;
        int dimb = b * LIMIT3/*_BRIGHTNESS * 3*/ / br;
//debug("r %d * %d / %d => %d, g %d * %d / %d => %d, b %d * %d / %d => %d", r, 3 * LIMIT_BRIGHTNESS, br, dimr, g, 3 * LIMIT_BRIGHTNESS, br, dimg, b, 3 * LIMIT_BRIGHTNESS, br, dimb);
        return Abits(color) | (dimr << 16) | (dimg << 8) | (dimb << 0); //don't need clamp()
    }
//    virtual /*inline*/ void pxrender(int x, FBPixels::color_t*& px24ptr, data_t chqbits[SIZEOF(bitmasks)])
    /*virtual*/ static /*inline*/ void pxrender_3ppb(int& want_debug, int xy, GapPtr</*FBPixels::*/color_t>& px24ptr, wsnode_t wsnodes[NUMCH]) //SIZEOF(bitmasks)])
    {
//        static constexpr int count = 0; //TODO: pass in?
//        int& m_ppb = static_m_ppb(); //kludge: create l-value
//        int& m_debug_pivot = static_m_debug_pivot(); //kludge: create l-value
//        if (want_debug) //show channel bits to pivot
        for (int ch = 0; ch < /*SIZEOF(chqbits)*/NUMCH; ++ch)
        {
            if ((want_debug > 0) && (limit(wsnodes[ch], m_maxbright()[ch]) != wsnodes[ch]) && (want_debug-- > 0)) debug("limit brightness[ch %'d][xy %'d]: 0x%x => 0x%x", ch, xy, wsnodes[ch], limit(wsnodes[ch], m_maxbright()[ch]));
//perf2: no limit()
            wsnodes[ch] = limit(wsnodes[ch], m_maxbright()[ch]); //limit brightness
//            if (RGBbits(wsnodes[ch]) && (want_debug-- > 0)) debug("to pivot: wsnodes[ch %'d][xy %'d] = 0x%x, %d ppb", ch, xy, wsnodes[ch], 3); //m_ppb);
        }
//TODO: unwind loop at compile-time?
//only bottom 24 bits of wsnodes used TODO: use upper for alpha/blend?
        for (uint32_t bit = 0x800000; bit; bit >>= 1) //only render 24 RGB bits
        {
//CAUTION: a lot of memory accesses here; slow on RPi
#define BITMASKS(n)  (0x800000 >> (n)) //perf1; slightly faster
//#define BITMASKS(n)  bitmasks[n]
//CAUTION: swapped bitmasks so channel 0..7 = R0..7, 8..15 = G0..7, 16..23 = B0..7
//makes addressing a little simpler in caller
            color_t px24 = //Abits(::WHITE) | //0xFF000000 |
                ((wsnodes[0] & bit)? BITMASKS(7- 0): 0) |
                ((wsnodes[1] & bit)? BITMASKS(7- 1): 0) |
                ((wsnodes[2] & bit)? BITMASKS(7- 2): 0) |
                ((wsnodes[3] & bit)? BITMASKS(7- 3): 0) |
                ((wsnodes[4] & bit)? BITMASKS(7- 4): 0) |
                ((wsnodes[5] & bit)? BITMASKS(7- 5): 0) |
                ((wsnodes[6] & bit)? BITMASKS(7- 6): 0) |
                ((wsnodes[7] & bit)? BITMASKS(7- 7): 0) |

                ((wsnodes[8] & bit)? BITMASKS(23- 8): 0) |
                ((wsnodes[9] & bit)? BITMASKS(23- 9): 0) |
                ((wsnodes[10] & bit)? BITMASKS(23- 10): 0) |
                ((wsnodes[11] & bit)? BITMASKS(23- 11): 0) |
                ((wsnodes[12] & bit)? BITMASKS(23- 12): 0) |
                ((wsnodes[13] & bit)? BITMASKS(23- 13): 0) |
                ((wsnodes[14] & bit)? BITMASKS(23- 14): 0) |
                ((wsnodes[15] & bit)? BITMASKS(23- 15): 0) |

                ((wsnodes[16] & bit)? BITMASKS(39- 16): 0) |
                ((wsnodes[17] & bit)? BITMASKS(39- 17): 0) |
                ((wsnodes[18] & bit)? BITMASKS(39- 18): 0) |
                ((wsnodes[19] & bit)? BITMASKS(39- 19): 0) |
                ((wsnodes[20] & bit)? BITMASKS(39- 20): 0) |
                ((wsnodes[21] & bit)? BITMASKS(39- 21): 0) |
                ((wsnodes[22] & bit)? BITMASKS(39- 22): 0) |
                ((wsnodes[23] & bit)? BITMASKS(39- 23): 0);
#undef BITMASK
//if ((count < 3) && new24) debug("^%p ('%'lu) <- 0x%x", bp24, )
#if 1 //perf1: off
//            if ((px24ptr < &pixels[0][0]) || (px24ptr >= &pixels[height()][0]))
//                RETURN(errmsg("pivot loop[%'d/%'d] bad: bp24 %px scrv. pixels@ %p..%p", x, univlen(), px24ptr, px24));
            if (Abits(px24)) RETURN(clear_error(), errmsg("pivot turned on non-RGB bit: 0x%x", Abits(px24)));
            if ((want_debug > 0) && RGBbits(px24) && (want_debug-- > 0)) debug("wsnode[%'d] bit 0x%x = 0x%x", xy, bit, px24);
#endif //1
//if (new24 || (x == 7)) debug("loop[%'d/%'d]: ^%p++ (ofs %'d) = 0x%x", x, m_chqbytes, bp24, bp24 - &pixels[0][0], new24);
//TODO?            if (px24) ++non0s;
//            if (m_debug_pivot && px24) debug("pivot[%'d]: qb[%'d]/px[%'d] = 0x%x", count, x, px24ptr - &pixels[0][0], px24);
//            (*m_pxrender)(px24ptr, px24 | Abits(::WHITE));
//            *px24ptr++ = px24 | Abits(::WHITE);
//            switch (m_ppb)
//            {
//                case 3: //preferred (minimum px); each wsnode generates 3 px: 1/1/1
//            if (px24ptr.isgap()) errmsg("storing WHITE start bit in storage gap@ %p", /*(color_t*)*/px24ptr);
//const color_t* sv = &*px24ptr;
//px24ptr.want_debug = (xy == 4) && (bit <= 0x8000) && (bit >= 0x800);
            px24ptr.nongapsave(m_startbits()); //*px24ptr++ = ::WHITE; //ws start bits; only needs to be done 1x
//            if (px24ptr.isgap()) errmsg("storing WS281x data 0x%x in storage gap@ %p", px24, /*(color_t*)*/px24ptr);
            px24ptr.nongapsave(px24 | Abits(::WHITE)); //ws data bits
            px24ptr.gapsave(m_stopbits()); //ws stop bits; only needs to be done 1x
//if ((&*px24ptr - sv != 3) || (xy == 4)) debug("gap[xy %'d, bit 0x%x]: %d @ 0x%p", xy, bit, &*px24ptr - sv, sv);
#if 0 //standardize on 3 ppb (~= 2.4MHz SPI)
                    break;
                case 8: //each wsnode generates 8 px: 2/3/3
                    *px24ptr++ = *px24ptr++ = ::WHITE; //ws start bit; only needs to be done 1x
                    *px24ptr++ = *px24ptr++ = *px24ptr++ = px24 | Abits(::WHITE); //ws data bit
                    *px24ptr++ = *px24ptr++ = *px24ptr++ = ::BLACK; //ws stop bit; only needs to be done 1x
                    break;
                case 12: //dev? 3/4/5
                    *px24ptr++ = *px24ptr++ = *px24ptr++ = ::WHITE; //ws start bit; only needs to be done 1x
                    *px24ptr++ = *px24ptr++ = *px24ptr++ = *px24ptr++ = px24 | Abits(::WHITE); //ws data bit
                    *px24ptr++ = *px24ptr++ = *px24ptr++ = *px24ptr++ = *px24ptr++ = ::BLACK; //ws stop bit; only needs to be done 1x
                    break;
                case 19: //dev only: 8/4/7
                    for (int i = 0; i < 8; ++i) *px24ptr++ = ::WHITE; //ws start bit; only needs to be done 1x
                    for (int i = 8; i < 12; ++i) *px24ptr++ = px24 | Abits(::WHITE); //ws data bit
                    for (int i = 12; i < 19; ++i) *px24ptr++ = ::BLACK; //ws stop bit; only needs to be done 1x
                    break;
            }
#endif //0
        }
    }
    NAPI_STOP_EXPORTS(WS281x); //public
};
//int WS281x::m_ppb; //#px used to render each WS281x data bit
//kludge: token pasting !worky with "<>"
//class WS281x_8: public WS281x<8>
//{
//need to re-export inherited members:
//public:
//    NAPI_START_EXPORTS(WS281x_8, WS281x<8>);
//    NAPI_STOP_EXPORTS(WS281x_8); //public
//};
NAPI_EXPORT_CLASS(WS281x); //(WS281x_8, "WS281x");
#endif //def WANT_FB


///////////////////////////////////////////////////////////////////////////////
////
/// alternate interface (experimental):
//

#if 0
//TODO: merge with above
class WS281x
{
    NAPI_START_EXPORTS(WS281x);
    enum { NUMCH = 24}; //fixed limit; uses all RGB bits
    using data_t = uint32_t; //uint8_t; //use quad bytes to allow denser indexing
    using col_t = ary<Pivot24, data_t>;
    using row_t = ary<Pivot24, col_t, data_t>;
    int m_fb, m_shadow;
    CFG::screeninfo_t m_scrinfo;
    data_t* m_chdata; //CAUTION: pivot buf != pixel buf; pivot buf uses separated bit-channels
public: //ctor/dtor
    WS281x(int fb = -1, int shadow = -1): m_scrinfo(*CFG::screeninfo(fb)), m_pxbuf()
    {
        if (shadow != -1) debug("TODO: shadow device");
    }
private: //ctor helpers (member init)
    color_t* m_px_init()
    {
        size_t height = scrv.yres; //scrv.yres + scrv.upper_margin + scrv.vsync_len + scrv.lower_margin;
        size_t rowlen32 = scrf.line_length / sizeof(color_t); //NOTE: might be larger than screen hres due to padding
        if (rowlen32 != width) debug(YELLOW_MSG "CAUTION: raster rowlen32 %'lu != scr width %'d + %'d+%'d+%'d", rowlen32, scrv.xres, scrv.left_margin, scrv.hsync_len, scrv.right_margin);
        if (height * rowlen32 * 4 != scrf.smem_len) debug(YELLOW_MSG "CAUTION: raster size %'lu != scr mem len %'d", height * rowlen32 * 4, scrf.smem_len);
        SDL_SetError("(potential multi-CPU contention)");
        if ((rowlen32 * 4) % CACHELEN) debug(YELLOW_MSG "row len !multiple of cache size %'d: 0x%lx", CACHELEN, rowlen32 * 4);
        return isOpen()? (color_t*)fb_mmap((void*)0, height * rowlen32 * 4, PROT_READ | PROT_WRITE, MAP_SHARED, (int)*this, 0): (color_t*)MAP_FAILED; //shared with GPU
    }
public: //properties
    inline size_t numch() const { return NUMCH; }
    NAPI_EXPORT_PROPERTY(WS281x, numch);
    inline size_t univlen() const { return m_scrinfo.yres(); }
    row_t& pixels; //2D pixel array access; at() bounds check, "[]" no bounds check

ws    const CHBYTES = rndup(UNIVLEN * Uint32Array.BPE, CACHEROW);
ws    const pxbuf = new ArrayBuffer(NUMCH * CHBYTES);
//https://stackoverflow.com/questions/4852017/how-to-initialize-an-arrays-length-in-javascript
ws    const channels = Array.from({length: NUMCH}, (val, inx) => new Uint32Array(pxbuf, inx * CHBYTES, inx? CHBYTES: NUMCH * CHBYTES)); //allow linear addr via first channel only
ws    elapsed(); //start stopwatch
ws    let numfr = 0;
ws    let busy = 0, idle = 0;
ws        busy += elapsed();
ws        idle += elapsed();
    const ws = new WS281x({fbdev: 1, shadow: 0}); //"/dev/fb1"); //primary (lights)
    const channels = ws.channels;
    for (let ch = 0; ch < ws.NUMCH; ++ch)
    {
        for (let node = 0; node < ws.UNIVLEN; ++node)
            channels[ch][node] = PALETTE[ws.numfr % PALETTE.length];
    debug("%'d frames: busy %'d msec (%d%%), idle %'d msec (%d%%)", ws.numfr, ws.busy, percent(ws.busy / (ws.busy + ws.idle), ws.idle, precent(ws.idle / (ws.busy + ws.idle)));

    NAPI_STOP_EXPORTS(WS281x); //public
};
NAPI_EXPORT_CLASS(WS281x);
#endif //0


#ifdef WANT_OGL
///////////////////////////////////////////////////////////////////////////////
////
/// OpenGL (texture) interface (offloads some CPU work to GPU):
//

//critical design details:
//RPi restrictions:
//pixclock = int div 19.2 MHz or po2/even divide 250 MHz?
//slower pixclock uses less power?
//xres or xtotal must be even?
//WS protocol:
//hblank <= ~ 40% 1.25 usec == .5 usec
//vblank >= 50 usec
//my YALP:
//xtotal * ytotal * pixclock ~= 30 fps

//RPi config.txt framebuffer_priority:
//https://www.raspberrypi.org/documentation/configuration/config-txt/video.md
//pass 0 or 2 to dispmanx:
//Main LCD	0 (dpi)
//Secondary LCD	1
//HDMI 0	2
//Composite	3
//HDMI 1	7

class Window
{
//    using u32 = uint32_t; //less keystokes :P
public: //ctor/dtor
    Window(): Window(screen()) {}
    Window(int s): Window(s, width(s), height(s)) {}
    Window(const char* t): Window(screen(), t) {}
    Window(int s, const char* t): Window(s, t, width(s), height(s)) {}
    Window(uint32_t w, uint32_t h): Window(mktitle(width, height), w, h) {}
    Window(int s, uint32_t w, uint32_t h): Window(s, mktitle(w, h), w, h) {}
    Window(const char* t, uint32_t w, uint32_t h): Window(screen(), t, w, h) {}
    Window(int screen, const char* title, uint32_t width, uint32_t height)
    {
//        if (!width || !height) { width = SCREEN_DISP_WIDTH; height = UNIV_LEN; }
#ifdef RPI_NO_X
// create an EGL window surface, passing context width/height
    	uint32_t dispw, disph;
	    if (graphics_get_display_size(scr, &dispw, &disph) < 0) errmsg("can't get display(%d) size", screen);
        else if ((width != dispw) || (height != disph)) warn("requested window size %'d x %'d != display size %'d x %'d", width, height, dispw, disph);

        VC_RECT_T src_rect;
        src_rect.x = src_rect.y = 0;
        src_rect.width = dispw << 16; //why? maybe just >>> screen size?
        src_rect.height = disph << 16;
//	state.width = display_width; //fixed screen size; override
//	state.height = display_height;
//    if (state.width != SCREEN_DISP_WIDTH) return why(FALSE, "screen width %d does not match expected %d", state.width, SCREEN_DISP_WIDTH);
//    if (state.height != UNIV_LEN) return why(FALSE, "screen height %d does not match expected %d", state.height, UNIV_LEN);

//set dest to full screen:
        VC_RECT_T dst_rect;
        dst_rect.x = dst_rect.y = 0;
        dst_rect.width = dispw;
        dst_rect.height = disph;

//	if ((dst_rect.width != state.width) || (dst_rect.height != state.height))
//		printf("SCREEN MISMATCH: requested %d x %d, should be %d x %d\n", dst_rect.width, dst_rect.height, state.width, state.height);
        DISPMANX_DISPLAY_HANDLE_T dispman_display = vc_dispmanx_display_open(screen); //0 LCD
        DISPMANX_UPDATE_HANDLE_T dispman_update = vc_dispmanx_update_start(0);
        DISPMANX_ELEMENT_HANDLE_T dispman_element = vc_dispmanx_element_add(dispman_update, dispman_display, 0/*layer*/, &dst_rect, 0/*src*/, &src_rect, DISPMANX_PROTECTION_NONE, 0 /*alpha*/, 0/*clamp*/, (DISPMANX_TRANSFORM_T)0/*transform*/);

        static EGL_DISPMANX_WINDOW_T nativewindow;
    	nativewindow.element = dispman_element;
	    nativewindow.width = display_width;
	    nativewindow.height = display_height;
	    vc_dispmanx_update_submit_sync(dispman_update);
//	state.hWnd = &nativewindow;
#else //X11 native display initialization
//    bool get_canvas(bool want_vis)
//        if (sdl_window) return true;
        sdl_window = 0;
        sdl_renderer = 0;
//        if (!isXWindows()) return true;
//        debug("!try sdl? 0x%x ... using SDL on XW", !CFG.isXWindows());
        if (!SDL_OK(SDL_Init(SDL_INIT_VIDEO), "SDL_Init video")) RETURN(false);
        if (!SDL_OK(SDL_SetHint(SDL_HINT_RENDER_VSYNC, "1"), "SDL_SetHint VSYNC")) RETURN(false); //use video sync to avoid tear
        if (!SDL_OK(SDL_SetHint(SDL_HINT_RENDER_DRIVER, "RPI"), "SDL_SetHint RPI")) RETURN(false); //in case RPI is not first on list
        int dispinx = 0; //default first screen (for XWindows only)
        sscanf(nvl(getenv("DISPLAY"), ":0"), ":%d", &dispinx); //use current display
#if 0 //debug info
        debug("#disp: %d, #modes: %d", SDL_GetNumVideoDisplays(), SDL_GetNumDisplayModes(dispinx));
        for (int i = 0, limit = SDL_GetNumVideoDrivers(); i < limit; ++i)
            debug("video driver[%d/%d]: '%s'", i, limit, SDL_GetVideoDriver(i));
        SDL_Rect r = {0};
        if (!SDL_OK(SDL_GetDisplayBounds(0, &r), "SDL_GetDisplayBounds")) return false;
        debug("disp rect: (%'d, %'d), (%'d, %'d)", r.x, r.y, r.w, r.h);
#endif
        SDL_DisplayMode sdl_mode;
        if (!SDL_OK(SDL_GetCurrentDisplayMode(dispinx, &sdl_mode), "SDL_GetDisplayMode [%d]", dispinx)) RETURN(false);
        debug("video drvr '%s', fmt %s, disp %'d x %'d vs. screen %'d x %'d", nvl(SDL_GetCurrentVideoDriver(), "(none)"), PixelFormat(sdl_mode.format), sdl_mode.w, sdl_mode.h, scrv.xres, scrv.yres); //should match "tvservice -s"
//        decltype(m_scrinfo.var)& vs = m_scrinfo.var; //reduce verbosity
        switch (/*SDL_BITSPERPIXEL*/(sdl_mode.format))
        {
            case SDL_PIXELFORMAT_RGB888:
            case SDL_PIXELFORMAT_ARGB8888:
                scrv.transp.length = scrv.red.length = scrv.green.length = scrv.blue.length = 8;
                scrv.transp.offset = 24; scrv.red.offset = 16; scrv.green.offset = 8; scrv.blue.offset = 0;
                if (SDL_BITSPERPIXEL(sdl_mode.format) < 32) scrv.transp.length = 0;
                break;
//TODO: other formats?
            default:
                errmsg("unsupported pixel format: %s (%0x)", PixelFormat(sdl_mode.format), sdl_mode.format);
                RETURN(false);
        }
//for XWindows (dev), use upper right part of screen; else use entire screen
//kludge: RenderPresent !worky with hidden window, so create small (10 x 10) window
        const int W = want_vis? MIN(scrv.xres, sdl_mode.w): 10; //DONT_CARE;
        const int H = want_vis? MIN(scrv.yres, sdl_mode.h): 10; //DONT_CARE;
        const int X = (scrv.xres - W) * 9/10; //SDL_WINDOWPOS_UNDEFINED(dispinx);
        const int Y = (scrv.yres - H) * 9/10; //SDL_WINDOWPOS_UNDEFINED(dispinx);
        const bool vis = true; //false; //RenderPresent (needed for get_pixclock) !worky when hidden :(
        const int wflags = (vis? SDL_WINDOW_SHOWN: SDL_WINDOW_HIDDEN) | SDL_WINDOW_RESIZABLE; // | SDL_WINDOW_FULLSCREEN_DESKTOP | SDL_WINDOW_OPENGL; //start hidden, caller can show later; resizable only for dev/debug purposes
        const int rflags = SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC; //use SDL_RENDERER_PRESENTVSYNC to get precise refresh timing
#if 0 //no way to set Vsync or title?
        if (!SDL_OK(SDL_CreateWindowAndRenderer(W, H, wflags, &sdl_window, &sdl_renderer), "SDL_CreateWindowAndRenderer")) return false;
#else
        if (!SDL_OK(sdl_window = SDL_CreateWindow("GpuPort", X, Y, W, H, wflags), "SDL_CreateWindow")) RETURN(false);
        if (!SDL_OK(sdl_renderer = SDL_CreateRenderer(sdl_window, FIRST_RENDERER_MATCH, rflags), "SDL_CreateRenderer")) RETURN(false);
//SDL_Renderer* SDL_GetRenderer(SDL_Window* window)
#endif //0
        (void)SDL_GetWindowSize(sdl_window, &sdl_mode.w, &sdl_mode.h); //in case didn't get requested size
        char title[100];
        snprintf(title, sizeof(title), "GPU %'d x %'d", sdl_mode.w, sdl_mode.h);
        if (want_vis)
        {
            if ((sdl_mode.w != scrv.xres) || (sdl_mode.h != scrv.yres))
            {
                debug(RED_MSG "CAUTION: SDL window size %'d x %'d != screen size %'d x %'d", sdl_mode.w, sdl_mode.h, scrv.xres, scrv.yres);
                snprintf(title + strlen(title), sizeof(title) - strlen(title), " (not %'d x %'d)", scrv.xres, scrv.yres);
            }
//override FB info with SDL info:
            scrv.xres = sdl_mode.w;
            scrv.yres = sdl_mode.h;
            scrf.smem_len = sdl_mode.h * (scrf.line_length = sdl_mode.w * sizeof(m_pixels[0]));
        }
        (void)SDL_SetWindowTitle(sdl_window, title);
        scrv.bits_per_pixel = SDL_BITSPERPIXEL(sdl_mode.format);
        debug("window@ 0x%p: title '%s', fmt %s, %'d x %'d", sdl_window, title, PixelFormat(sdl_mode.format), sdl_mode.w, sdl_mode.h);
//        const char* fmt = SDL_GetPixelFormatName(sdl_mode.format);
//debug("cur disp mode: %d bpp, %s %'d x %'d", SDL_BITSPERPIXEL(sdl_mode.format), SDL_GetPixelFormatName(sdl_mode.format), sdl_mode.w, sdl_mode.h); //should match "tvservice -s"
//                debug("ioctl: get var info, %'d x %'d, %d bpp %s", vp->xres, vp->yres, vp->bits_per_pixel, fmt);
//errmsg(PINK_MSG "SDL_CreateWindowAndRenderer");
        SDL_RendererInfo rinfo;
        if (!SDL_OK(SDL_GetRendererInfo(sdl_renderer, &rinfo), "SDL_GetRendererInfo@ 0x%p", sdl_renderer)) return false;
        std::string fmts;
        for (int i = 0; i < rinfo.num_texture_formats; ++i)
            fmts += PixelFormat(rinfo.texture_formats[i], ";");
        if (!fmts.length()) fmts += ";none";
        debug("renderer@ 0x%p: name '%s', max %'d x %'d, flags %s (0x%x), %d fmts: %s", sdl_renderer, rinfo.name, rinfo.max_texture_width, rinfo.max_texture_height, RendererFlags(rinfo.flags), rinfo.flags, rinfo.num_texture_formats, fmts.c_str() + 1);
#ifndef LAZY_TEXTURE
//don't need texture until caller uses pixels: -wrong, need it for get_pixclock also?
        constexpr int acc = SDL_TEXTUREACCESS_STATIC; //_STREAM?; //don't need to lock if using separate pixel array + VSYNC?
//errmsg(PINK_MSG "SDL_CreateTexture");
        if (!SDL_OK(sdl_texture = SDL_CreateTexture(sdl_renderer, SDL_PIXELFORMAT_ARGB8888, acc, scrv.xres, scrv.yres), "SDL_CreateTexture %'d x %'d", scrv.xres, scrv.yres)) return MAP_FAILED;
#endif //ndef LAZY_TEXTURE
//        if (!SDL_OK(SDL_SetRenderDrawColor(sdl_renderer, R_G_B_A(color)))) return errmsg("SDL_SetRenderDrawColor");
//        if (!SDL_OK(SDL_RenderClear(sdl_renderer))) return errmsg("SDL_RenderClear");
////        SDL_SetRenderDrawColor(renderer, 255, 0, 0, 255);
//        (void)SDL_RenderPresent(sdl_renderer); //repaint screen; waits for VSYNC
        pxclear(::BLACK);
        RETURN(true);
    }
#endif //RPI_NO_X
    }
    ~Window()
    {
//    void drop_canvas()
        if (!isXWindows()) return;
//        if (fd != FAKED_FD) return errmsg(-1, "unknown close file: %d (wanted FB %d)", fd, FAKED_FD);
#ifndef LAZY_TEXTURE
        if (sdl_texture) SDL_DestroyTexture(sdl_texture);
        sdl_texture = 0;
#endif //ndef LAZY_TEXTURE
        if (sdl_renderer) SDL_DestroyRenderer(sdl_renderer);
        if (sdl_window) SDL_DestroyWindow(sdl_window);
        sdl_renderer = 0;
        sdl_window = 0;
        SDL_Quit();
    }
private: //helpers
//get default display props:
    inline static size_t screen() { return 0; } //LCD
    inline static size_t width() { return width(screen()); }
    static size_t width(int scr)
    {
    	uint32_t dispw, disph;
	    if (graphics_get_display_size(scr, &dispw, &disph) >= 0) return dispw;
        return errmsg(-1, "can't get display size");
    }
    inline static size_t height() { return height(screen()); }
    static size_t height(int scr)
    {
    	uint32_t dispw, disph;
	    if (graphics_get_display_size(scr, &dispw, &disph) >= 0) return disph;
        return errmsg(-1, "can't get display size");
    }
//generate recognization window title (if shown):
    inline static const char* mktitle(uint32_t w, uint32_t h) { return mktitle("OGL", w, h); }
    static const char* mktitle(const char* name, uint32_t width, uint32_t height)
    {
        static char buf[30];
        snprintf(buf, sizeof(buf), "%s %'d x %'d", name, width, height);
        return buf;
    }
};


//OpenGL I/O:
class OGLIO
{
public: //ctor/dtor
    OGLIO(): OGLIO(0) {} //default screen
    OGLIO(int scr) {}
    ~OGLIO() {}
public: //methods

};


//config info:
class CFG
{
    NAPI_START_EXPORTS(CFG);
    struct ScreenInfo
    {
        int screen;
        uint32_t pixclock; //psec
        size_t xres, yres, xtotal, ytotal;
        ScreenInfo(): screen(0), xres(0), yres(0), xtotal(0), ytotal(0), pixclock(0) {}
//        uint32_t rowtime() const { xtotal * pixclock / 1M; } //usec
        uint32_t frtime() const { xtotal * ytotal * pixclock / 1M; } //usec
        float fps() const { return 1M / frtime(); }
    };
    using scr_t = decltype(ScreenInfo.screen);
    using pixclock_t = decltype(ScreenInfo.pixclock);
    using scrinfo_t = ScreenInfo; //decltype(m_scrinfo);
    scrinfo_t m_scrinfo;
private: //ctor/dtor; private to prevent multiple instances
    CFG() {}
    ~CFG() {}
public: //props
    inline const scrinfo_t& scrinfo() const { return m_scrinfo; }
    inline const scrinfo_t& scrinfo(scr_t scr) { screen(scr); return m_scrinfo; }
    inline scr_t screen() const { return m_scrinfo.screen; }
    void screen(scr_t new_screen)
    {
        m_scrinfo.screen = new_screen;
        debug("TODO: get scr %d info", new_screen);
    }
    NAPI_EXPORT_PROPERTY(CFG, screen, screen);
    inline decltype(m_scrinfo.xres) xres() const { return m_scrinfo.xres; }
    inline void xres(decltype(m_scrinfo.xres) new_xres) { m_scrinfo.xres = new_xres; }
    NAPI_EXPORT_PROPERTY(CFG, xres, xres);
    inline decltype(m_scrinfo.yres) yres() const { return m_scrinfo.yres; }
    inline void yres(decltype(m_scrinfo.yres) new_yres) { m_scrinfo.yres = new_yres; }
    NAPI_EXPORT_PROPERTY(CFG, yres, yres);
    inline decltype(m_scrinfo.xtotal) xtotal() const { return m_scrinfo.xtotal; }
    inline void xtotal(decltype(m_scrinfo.xtotal) new_xtotal) { m_scrinfo.xtotal = new_xtotal; }
    NAPI_EXPORT_PROPERTY(CFG, xtotal, xtotal);
    inline decltype(m_scrinfo.ytotal) ytotal() const { return m_scrinfo.ytotal; }
    inline void ytotal(decltype(m_scrinfo.ytotal) new_ytotal) { m_scrinfo.ytotal = new_ytotal; }
    NAPI_EXPORT_PROPERTY(CFG, ytotal, ytotal);
    inline decltype(m_scrinfo.pixclock) pixclock() const { return m_scrinfo.pixclock; }
    inline void pixclock(decltype(m_scrinfo.pixclock) new_pixclock) { m_scrinfo.pixclock = new_pixclock; }
    NAPI_EXPORT_PROPERTY(CFG, pixclock, pixclock);
    NAPI_STOP_EXPORTS(CFG); //public
};
CFG& cfg = *CFG::singleton();
NAPI_EXPORT_OBJECT(cfg); //don't export ctor/class wrapper, just instance


//24-bit plane GpuPort:
class Pivot24: public OGLIO
{
    using SUPER = OGLIO;
    NAPI_START_EXPORTS(Pivot24);
    enum { CACHELEN = 64}; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both
    enum { B2b = 8}; //8 bits/byte
    enum { NUMCH = 24}; //fixed limit; uses all RGB bits
    enum { MAXCHLEN = 1_M / 20 / 30}; //max #nodes @30 usec each slower frame rate (20 fps)
//    using col_t = ary<Pivot24, data_t>;
//    using row_t = ary<Pivot24, col_t, data_t>;
//    FBPixels m_shadowFB; //copy pixels to another screen/window
//    const size_t m_chqbytes; //#quadbytes/channel
//    data_t* const m_chdata; //CAUTION: pivot buf != pixel buf; pivot buf uses separated bit-channels
//pad to avoid memory contention if using multiple CPUs:
    using data_t = uint32_t; //uint8_t; //use quad bytes to allow denser indexing
    enum { CHQBYTES = MAXCHLEN / std::lcm(sizeof(data_t), CACHELEN) };
    enum { DATABITS = 32, MSB = 0x80000000 };
//static alloc is a lot simpler; caller doesn't need to use it all:
    data_t m_chdata[NUMCH][CHQBYTES];
    inline bool inbounds(size_t y, size_t x) const { return ((y < NUMCH) && (x < CHQBYTES)); }
    int m_dirty;
public: //ctor/dtor
    Pivot24(): Pivot24(cfg.screen()) {}
    Pivot24(int scr): SUPER(scr)
    {
        debug("Pivot24 ctor@ 0x%p: scr %d, alloc %'lu bytes/channel = %'lu bytes total@0x%p", this, scr, SIZEOF(m_chdata[0]), sizeof(m_chdata), m_chdata);
    }
    ~Pivot24() { debug("Pivot24 dtor@ 0x%p", this); }
public: //props
    inline size_t numch() const { return NUMCH; }
    NAPI_EXPORT_PROPERTY(Pivot24, numch);
//    inline int bitclk() const { return scrv.pixclock; } //psec
//    NAPI_EXPORT_PROPERTY(Pivot24, bitclk);
    size_t chqbytes() const { return SIZEOF(m_chdata[0]); }
    size_t chbits() const { return SIZEOF(m_chdata[0]) * DATABITS; }
    NAPI_EXPORT_PROPERTY(Pivot24, chqbytes);
    NAPI_EXPORT_PROPERTY(Pivot24, chbits);
    inline decltype(m_dirty) dirty() const { return m_dirty; }
    inline void dirty(decltype(m_dirty) new_dirty) { m_dirty = new_dirty; }
    NAPI_EXPORT_PROPERTY(Pivot24, dirty, dirty);
//    inline int shadowfb() const { return m_shadowFB.fb(); }
//    void shadowfb(int shfb) { m_shadowFB.openfb(shfb); } //, true); }
//    NAPI_EXPORT_PROPERTY(Pivot24, shadowfb, shadowfb);
public: //methods
    bool chbit(size_t ch, size_t ofs, bool bit) //rd/wr; not fluent
    {
        if (bit) m_chdata[ch][ofs / DATABITS] |= MSB >> (ofs % DATABITS);
        else m_chdata[ch][ofs / DATABITS] &= ~(MSB >> (ofs % DATABITS));
        dirty(true);
        return bit; //TODO: fluent?
    }
    inline bool chbit(size_t ch, size_t ofs) { return (m_chdata[ch][ofs / DATABITS] >> (DATABITS - (ofs % DATABITS) - 1)) & 1; }
#ifdef USING_NAPI
    Napi::Value chbit_method(const Napi::CallbackInfo& info)
    {
        const auto y = info[0].As<Napi::Number>().Int32Value();
        const auto x = info[1].As<Napi::Number>().Int32Value();
//        size_t ixy = xyinx(y, x);
//help caller to debug indexing errors (assumes low bandwidth):
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber() || !inbounds(y, x) || ((info.Length() > 2) && !info[2].IsNumber())) return err_napi(info.Env(), "ch 0..%'d, ofs 0..%'d, optional bits (all Numbers) expected, got %d %s", NUMCH - 1, chbits() - 1, info.Length(), "(TODO: napi type)");
        if (info.Length() > 2)
        {
            const auto bitval = info[2].ToNumber().Uint32Value(); //As<Napi::Number>().Uint32Value();
//debug("color 0x%x", color);
            chbit(y, x, bitval);
//            dirty(true);
        }
        return Napi::Number::New(info.Env(), chbit(y, x));
    }
    NAPI_EXPORT_METHOD(Pivot24, "chbit", chbit_method);
    Napi::Value chqbyte_method(const Napi::CallbackInfo& info)
    {
        const auto x = info[0].As<Napi::Number>().Int32Value();
        const auto y = info[1].As<Napi::Number>().Int32Value();
//        size_t ixy = xyinx(x, y);
//help caller to debug indexing errors (assumes low bandwidth):
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber() || !inbounds(y, x) || ((info.Length() > 2) && !info[2].IsNumber())) return err_napi(info.Env(), "ch 0..%'d, delay 0..%'d, optional bits (all Numbers) expected, got %d %s", NUMCH - 1, chqbytes() - 1, info.Length(), "(TODO: napi type)");
        if (info.Length() > 2)
        {
            const auto bits = info[2].As<Napi::Number>().Uint32Value();
//debug("color 0x%x", color);
            m_chdata[y][x] = bits;
            dirty(true);
        }
        return Napi::Number::New(info.Env(), m_chdata[y][x]);
    }
    NAPI_EXPORT_METHOD(Pivot24, "chqbyte", chqbyte_method);
//public:
//    Napi::Value ch2Dary_cached;
//CAUTION: intended for low bandwidth usage (due to high per-access overhead)
    Napi::Value channels_getter(const Napi::CallbackInfo &info)
    {
//CAUTION: caller is responsible for setting dirty flag
//        Napi::Env env = info.Env();
//        int w = SIZEOF(m_chdata[0]), h = NUMCH;
//        data_t* chbuf = &channels[0][0]; //(w * h); //NOTE: Javascript handles array bounds checking (with lengths given below); don't need to handle it in here
//        if (!chbuf || !w || !h) return err_napi(info.Env(), "channel buffer broken");
//no worky :(        int iscached = (ch2Dary_cached.Env() == info.Env())? ch2Dary_cached.IsArray(): -2;
//debug("channels[%'d][%'d] getter, cached? %d", h, w, iscached);
//        if (iscached > 0) return ch2Dary_cached; //skip 2D array reconstruction
        auto arybuf = Napi::ArrayBuffer::New(info.Env(), &m_chdata[0][0], sizeof(m_chdata)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        auto retval = Napi::Array::New(info.Env(), NUMCH);
        for (uint32_t y = 0; y < NUMCH; ++y)
        {
            int len = SIZEOF(m_chdata[0]) * (y? 1: NUMCH); //allow caller to use linear addresses on first row; TODO: allow on other rows also?
            auto rowary = Napi::TypedArrayOf<data_t>::New(info.Env(), len, arybuf, y * sizeof(m_chdata[0]), napi_uint32_array); ////https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
//?            retval.set(y, rowary);
            retval[y] = rowary; //CAUTION: RPi needs y to be uint32_t
        }
//Buffer<t> Napi::Buffer<t>::New(env, data*, len);
//        ch2Dary_cached = retval;
//debug("now is it cached? %d, retval env? %d", (ch2Dary_cached.Env() == info.Env())? ch2Dary_cached.IsArray(): -2, retval.Env() == info.Env());
        return retval; //array of typed arrays
    }
    NAPI_EXPORT_WRAPPED_PROPERTY(Pivot24, "channels", channels_getter);
#endif //def USING_NAPI
    inline void fill() { fill(0); }
//    void fill(constexpr uint32_t argb) { fill(_t color(argb); debug("fill %'d px with 0x%x", m_numpx, color.uint32); for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color.uint32; }
//    void fill(constexpr uint32_t argb) { argb_t color(argb); debug("fill %'d px with 0x%x", m_numpx, color.uint32); for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color.uint32; }
    void fill(data_t bits) //CAUTION: overrides FB::fill
    {
        usec_t started = now_usec();
        if (!bits || (bits == -1)) memset(m_chdata, bits, sizeof(m_chdata)); //all bits =
        else for (size_t i = 0; i < NUMCH * SIZEOF(m_chdata); ++i) m_chdata[0][i] = bits;
debug("fill(0x%x) %'lu qbytes took %'u usec (excl refresh)", bits, NUMCH * SIZEOF(m_chdata), now_usec() - started);
        dirty(true);
    }
#ifdef USING_NAPI
    Napi::Value fill_method(const Napi::CallbackInfo& info)
    {
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "bit mask (1 Number) expected, got %d %s", info.Length(), "(TODO: napi type)");
        const auto bits = info[0].As<Napi::Number>().Uint32Value();
        fill(bits); //updates pixel array in memory
        return info.Env().Undefined(); //Napi::Number::New(info.Env(), 0);
    }
    NAPI_EXPORT_METHOD(Pivot24, "fill", fill_method);
#endif //def USING_NAPI
//flush dirty channel data and wait:
    inline bool out_msec() { return out_msec(0); }
    inline bool out_msec(int msec)
    {
        if (dirty()) render(); //TODO: move to fg thread?
        return wait_msec(msec);
    }
#ifdef USING_NAPI
    Napi::Value awaitout_method(const Napi::CallbackInfo& info)
    {
//debug("async method: #args %d, arg[0] %s", info.Length(), NapiType(info[0]));
        if (info.Length() && !info[0].IsNumber()) return err_napi(info.Env(), "milliseconds (Number) expected; got %s", NapiType(info.Length()? info[0]: info.Env().Undefined()));
//        const auto delay_msec = info[0].As<Napi::Number>().Int32Value();
        int delay_msec = info.Length()? info[0].As<Napi::Number>().Int32Value(): 0;
        auto async_exec = [this, delay_msec]() -> bool { return out_msec(delay_msec); };
//debug("out(%'d), dirty? %d", delay_msec, dirty());
        NAPI_ASYNC_RETURN(async_exec);
    }
    NAPI_EXPORT_METHOD(Pivot24, "out", awaitout_method);
#endif //def USING_NAPI
private: //helpers
    void render()
    {
        debug("TODO: render");
    }
    bool wait_msec(msec_t msec)
    {
        debug("TODO: wait4sync %'d msec", msec);
    }
    NAPI_STOP_EXPORTS(Pivot24); //public
};
NAPI_EXPORT_CLASS(Pivot24);


//WS281x data protocol:
class WS281x: public Pivot24
{
    using SUPER = Pivot24;
    NAPI_START_EXPORTS(WS281x, SUPER);
    int m_univlen;
public: //ctor/dtor
    WS281x() {}
    ~WS281x() {}
public: //props
    inline decltype(m_univlen) univlen() const { return m_univlen; }
    NAPI_EXPORT_PROPERTY(WS281x, univlen);
public: //methods
private: //helpers
    void render()
    {
        debug("TODO: WS281x render");
    }
    NAPI_STOP_EXPORTS(WS281x); //public
};
NAPI_EXPORT_CLASS(WS281x);
#endif //def WANT_OGL


///////////////////////////////////////////////////////////////////////////////
////
/// CLI (test jig):
//

#ifndef USING_NAPI //NODE_API_MODULE //NODE_GYP_MODULE_NAME
#pragma message(CYAN_MSG "compiled for stand-alone (non-Node) usage" ENDCOLOR_NOLINE)

#include <cstdio> //fileno()
#include <unistd.h> //isatty()


//WS281X test using Linux framebuffer:
//https://www.kernel.org/doc/Documentation/fb/api.txt
int main(int argc, char* argv[])
{
//    setlocale(LC_ALL, ""); //enable %'d commas in printf
//    const bool noGUI = isatty(fileno(stdin)); //https://stackoverflow.com/questions/13204177/how-to-find-out-if-running-from-terminal-or-gui
//    const bool CFG.isXWindows = !!getenv("DISPLAY");
//    const bool isXTerm = !!getenv("TERM");
//    const bool isSSH = !!getenv("SSH_CLIENT");
    debug("running X-Windows? %d, gui? %d, xterm? %d, ssh? %d, RPi? %d", cfg.isXWindows(), !cfg.noGUI(), cfg.isXTerm(), cfg.isSSH(), cfg.isRPi());

debug("(ext) colors: red 0x%x, green 0x%x, blue 0x%x", ::RED, ::GREEN, ::BLUE);
//debug("internal: red 0x%x, green 0x%x, blue 0x%x", color_t(::RED).uint32, color_t(::GREEN).uint32, color_t(::BLUE).uint32);
//return 0;
//rel time test:
//    for (int i = 0; i < 10; ++i)
//    {
//        debug("time[%d] %'d", i, now_msec());
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
//    auto elapsed = fb.elapsed(); //now_msec();
//debug("here3");
    debug(CYAN_MSG "%'d frames, %4.3f sec = %3.2f fps, slept %4.3f sec (%2.1f%%)", fb.numfr(), fb.elapsed() / 1e3, 1e3 / fb.frtime(), fb.slept() / 1e3, 100.0 * fb.slept() / fb.elapsed());
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
    debug("px @0x%p, row[0] @0x%p, row[1] @0x%p, px[0][0] @0x%p, px[0][1] @0x%p, px[1][0] @0x%p", &fb.pixels, &fb.pixels[0], &fb.pixels[1], &fb.pixels[0][0], &fb.pixels[0][1], &fb.pixels[1][0]);
    for (int mode = 1; mode <= 3; ++mode)
    {
        debug("row test[%d] (%'d sec) ...", mode, (int)(height / 1e3 * fb.frtime()));
        fb.elapsed(0); //reset stopwatch
        const FBPixels::color_t color = ::YELLOW; //_low; //(0xFF, 0, 0x80, 0x80); //dim red
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
        debug(CYAN_MSG "%'d rows (%'d frames) 0x%x, %4.3f sec = %3.2f fps, slept %4.3f sec (%2.1f%%)", height, fb.numfr(), (uint32_t)color/*.uint32*/, fb.elapsed() / 1e3, 1e3 / fb.frtime(), fb.slept() / 1e3, 100.0 * fb.slept() / fb.elapsed());
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
    debug(CYAN_MSG "%'d rows + %'d cols = %'d frames, %4.3f sec = %3.2f fps, slept %4.3f sec (%2.1f%%)", height / 100, width / 100, fb.numfr(), fb.elapsed() / 1e3, 1e3 / fb.frtime(), fb.slept() / 1e3, 100.0 * fb.slept() / fb.elapsed());
    fb.wait_sec(5); //give time to see before closing

    return(0);
}
#endif //USING_NAPI //ndef NODE_API_MODULE //NODE_GYP_MODULE_NAME

NAPI_EXPORT_MODULES(); //export modules to Javascript

//eof