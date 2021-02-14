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
#endif //def NODE_GYP_MODULE_NAME
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

#include "macro-vargs.h"

//compile-time length of array:
#define SIZEOF(thing)  (sizeof(thing) / sizeof((thing)[0]))

//should use "static" but compiler doesn't like it:
#define STATIC  //static

//left/right shift:
#define shiftlr(val, pos)  (((pos) < 0)? ((val) << -(pos)): ((val) >> (pos)))

//divide up:
#define divup(num, den)  (((num) + (den) - 1) / (den))
//rounded divide:
#define rdiv(num, den)  (((num) + (den) / 2) / (den))
//make value a multiple of another:
#define multiple(num, den)  ((num) - (num) % (den))

//no worky :(
//static double operator%(double lhs, const int rhs)
//{
//    return lhs - rhs * (int)(lhs / rhs);
//}
#define mod(num, den)  ((num) - (den) * (int)((num) / (den)))


//min/max:
#define MIN(a, b)  (((a) < (b))? (a): (b))
#define MAX(a, b)  (((a) > (b))? (a): (b))

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


//debug helpers:
//#define debug(msg)  printf(BLUE_MSG msg ENDCOLOR_ATLINE)
//TODO: use FIRST() and OTHERS() to peel off first arg
static int prevout = true; //don't need to start with newline
#define debug(...)  UPTO_16ARGS(__VA_ARGS__, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_MORE_ARGS, debug_1ARG) (__VA_ARGS__)
#define debug_1ARG(msg)  prevout = printf("\n" BLUE_MSG msg ENDCOLOR_ATLINE + (prevout > 0))
#define debug_MORE_ARGS(msg, ...)  prevout = printf("\n" BLUE_MSG msg ENDCOLOR_ATLINE + (prevout > 0), __VA_ARGS__)

#define fatal(...)  UPTO_16ARGS(__VA_ARGS__, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_MORE_ARGS, fatal_1ARG) (__VA_ARGS__)
#define fatal_1ARG(msg)  (fprintf(stderr, "\n" RED_MSG "FATAL: " msg ENDCOLOR_ATLINE + (prevout > 0)), exit(1))
#define fatal_MORE_ARGS(msg, ...)  (fprintf(stderr, "\n" RED_MSG "FATAL: " msg ENDCOLOR_ATLINE + (prevout > 0), __VA_ARGS__), exit(1))


//SDL helpers:
//https://wiki.libsdl.org/CategoryAPI
#ifdef HAS_SDL //set by binding.gyp if detected
//#if 1
 #include <SDL.h>
 #define SDL_OK(retval)  ((retval) >= 0) //((SDL_LastError = (retval)) >= 0)
// #pragma message(CYAN_MSG "assuming libSDL2 is installed" ENDCOLOR_NOLINE)
//#else //TODO?
//SDL retval conventions:
//0 == Success, < 0 == error, > 0 == data ptr (sometimes)
//#define SDL_Success  0
//#define SDL_OtherError  -2 //arbitrary; anything < 0
//int SDL_LastError = SDL_Success; //remember last error (mainly for debug msgs)
//use overloaded function to handle different SDL retval types:
//#define SDL_OK(retval)  ((SDL_LastError = (retval)) >= 0)
//inline bool SDL_OK(int errcode)
//{
//    return ((SDL_LastError = errcode) >= 0);
//}
//template <typename ... ARGS> //perfect fwd
//inline bool SDL_OK(SDL_bool ok, ARGS&& ... why)
//{
//    return SDL_OK((ok == SDL_TRUE)? SDL_Success: SDL_SetError(std::forward<ARGS>(why) ...));
//}
//inline bool SDL_OK(void* ptr) //SDL error text already set; just use dummy value for err code
//{
//    return SDL_OK(ptr? SDL_Success: SDL_OtherError);
//}
//#define SDL_exc(...)  UPTO_3ARGS(__VA_ARGS__, SDL_exc_3ARGS, SDL_exc_2ARGS, SDL_exc_1ARG) (__VA_ARGS__)
//#define SDL_exc_1ARG(what_failed)  error(what_failed, SRCLINE)
//#define SDL_exc_2ARGS(what_failed, srcline)  error(what_failed, ifnull(srcline, SRCLINE))
//#define SDL_exc_3ARGS(what_failed, want_throw, srcline)  ((want_throw)? error(what_failed, ifnull(srcline, SRCLINE)): debug(SDL_LEVEL, what_failed, ifnull(srcline, SRCLINE)))
#endif //def HAS_SDL


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
#define brightness(color)  (R(color) + G(color) + B(color))
//parameter lists:
#define R_G_B_A(color)  R(color), G(color), B(color), A(color)
#define A_R_G_B(color)  A(color), R(color), G(color), B(color)

#define Abits(color)  ((color) & 0xFF000000) //cbyte(color, -24) //-Ashift)
#define RGBbits(color)  ((color) & 0x00FFFFFF) //((color) & ~ABITS(0xFFffffff))
#define Rbits(color)  ((color) & 0x00FF0000) //cbyte(color, -16) //-Rshift)
#define Gbits(color)  ((color) & 0x0000FF00) //cbyte(color, -8) //-Gshift)
#define Bbits(color)  ((color) & 0x000000FF) //cbyte(color, -0) //-Bshift)

//convert back to external (caller) ARGB order from internal (FB) order:
#define toARGB(a, r, g, b)  ((clamp(a) << 24) | (clamp(r) << 16) | (clamp(g) << 8) | (clamp(b) << 0))


//clamp byte:
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
#define LIMIT_BRIGHTNESS  0xAA //67%
//212 == 83% limit; max 60 => 50 mA / LED
//170 == 67% limit; max 60 => 40 mA / LED
//128 == 50% limit: max 60 => 30 mA / LED
//TODO: auto-brighten? (multiply if < threshold brightness)
#ifdef LIMIT_BRIGHTNESS
 #define auto_dim(color)  MIN(3 * LIMIT_BRIGHTNESS / brightness(color), 1)
// #define LIMIT(color)  ((auto_dim(color) < 1)? toARGB(A(color), R(color) * auto_dim(color), G(color) * auto_dim(color), B(color) * auto_dim(color)): (color))
 #define LIMIT(color)  toARGB(A(color), R(color) * auto_dim(color), G(color) * auto_dim(color), B(color) * auto_dim(color))
#else
 #define LIMIT(color)  (color) //as-is
#endif


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


//turn null ptr into empty/default str:
inline const char* nvl(const char* str, const char* null = 0)
{
    return (str && str[0])? str: (null && null[0])? null: "";
}


//check for file existence:
inline bool fexists(const char* path)
{
    struct stat info;
    return !stat(path, &info); //file exists
}


//name demangling:
#if 0 //maybe use for debug?
//https://stackoverflow.com/questions/3649278/how-can-i-get-the-class-name-from-a-c-object
#include <cxxabi.h>
#define quote(x) #x
template <typename foo,typename bar> class one{ };
int main(){
    one<int,one<double, int> > A;
    int status;
    char * demangled = abi::__cxa_demangle(typeid(A).name(),0,0,&status);
    std::cout<<demangled<<"\t"<< quote(A) <<"\n";
    free(demangled);
#endif


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
#if 0
inline /*long*/ int time2msec(struct timeval* tv) 
{
//CAUTION: "*" clamps on RPi?; use smaller intermediate results to avoid
//    constexpr long YEAR_SEC = 365 * 24 * 60 * 60; //#sec/year; use to trim system time to smaller value
//    static long int started = 0;
    static auto started = tv->tv_sec - 1; //set epoch first time called
    /*long*/ int msec = (tv->tv_sec - started) * 1e3 + tv->tv_usec / 1e3; //"int" won't wrap for relative times
//decltype(started) sv_st = started;
//    if (!started) started = msec - 1; //make result non-0
//debug("started %ld, sec %ld + usec %ld => msec %ld", started, tv->tv_sec, tv->tv_usec, msec);
//    msec -= started; //relative to first time called
//    static int limit = std::numeric_limits<decltype(time2msec(tv))>::max();
//    if (msec > limit) fatal("rel time too big: %ld (max %d)", msec, limit);
    return msec;
}
#endif //0
/*long*/ int time2msec()
{
    struct timeval timeval;
//    struct timezone& tz = *(struct timezone*)0; //relative times don't need this
    if (gettimeofday(&timeval, 0/*&tz*/)) fatal("gettimeofday"); // %#p", &tz);
//    return time2msec(&timeval);
    static auto started = timeval.tv_sec - 1; //set epoch first time called
    /*long*/ int msec = (timeval.tv_sec - started) * 1e3 + timeval.tv_usec / 1e3; //"int" won't wrap for relative times
    return msec;
}
//#define time_t  msec_t //kludge: name conflict; use alternate
using msec_t = decltype(time2msec()); //long int;


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
debug("shell '%s' output %'d:'%s'", cmd, result.length(), result.c_str());
    return result;
}


inline void clear_error()
{
    errno = 0;
//    (void)SDL_ClearError();
    (void)SDL_SetError("");
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
    const char* reason = nvl(errno? std::strerror(errno): SDL_GetError(), "(no details)"); //nvl(SDL_GetError(), "(SDL error)");
    constexpr const char* try_sudo = " Try \"sudo\"?"; //std::string try_sudo(" Try \"sudo\".");
    static bool isroot = !geteuid(); //(getuid() == geteuid()); //0 == root
    char fmt[256]; //composite msg fmt string
//    static int isdup = 0;
    static char prevfmt[sizeof(fmt)] = {0};
//    if (!reason[0]) snprintf(fmt, sizeof(fmt), "\n" RED_MSG "%s%s" ENDCOLOR_NEWLINE, desc, srcline); else
    snprintf(fmt, sizeof(fmt), "\n" RED_MSG "%s error: %s.%s%s" ENDCOLOR_NEWLINE, desc, reason, &try_sudo[(isroot || !errno)? strlen(try_sudo): 0], srcline);
    strcpy(strend(fmt) - 5, " ..."); //truncation indicator
//    for (char* bp = fmt + 1; bp = strchr(bp, '\n'); *bp = 0xff); //strcpy(bp, bp + 1)); //remove newlines
//printf("err fmt: '%s', errno %d, isroot? %d, dup? %d, prevout %d\n", fmt + 1, errno, isroot, !strcmp(prevfmt, fmt), prevout);
    if (errno) isroot = true; //suggest sudo first time only
    if (!strcmp(prevfmt, fmt)) //dup (probably); include line# in check, but *not* values
    {
        int now = time2msec();
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


///////////////////////////////////////////////////////////////////////////////
////
/// config
//

#include <stdio.h> //close()
#include <fcntl.h> //open(), O_RDWR
#include <sys/ioctl.h> //ioctl()
#include <linux/fb.h> //FBIO_*, struct fb_var_screeninfo, fb_fix_screeninfo
#include <cstdio> //fileno()
#include <unistd.h> //isatty()
#include <cstdio> //sscanf
//#include <regex>

//RPi clock stored in KHz, XWindows pixclock stored in psec
//RPi 20 MHz (20K) <=> XWindows 50K psec (50K)
//use this macro to convert in either direction:
#define psec2KHz(clk)  (1e9 / clk) //((double)1e9 / clk)


class CFG
{
    NAPI_START_EXPORTS(CFG);
//these won't change so set them once:
//    bool m_noGUI = isatty(fileno(stdin)); //https://stackoverflow.com/questions/13204177/how-to-find-out-if-running-from-terminal-or-gui
//DRY    const bool CFG.isXWindows = !!getenv("DISPLAY");
//    bool m_isXWindows = (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
//DRY: do these in Node.js addon rather than in Javascript
//    bool m_isXTerm = !!getenv("TERM");
//    bool m_isSSH = !!getenv("SSH_CLIENT");
//    bool m_isRPi = fexists("/boot/config.txt");
//    std::string m_dev;
//just give caller one struct to deal with:
    /*static*/ struct fb_screeninfo
    {
        int fb; //which fb
//        int isopen;
        bool isvalid;
        char fbdev[30]; //device name
        struct fb_var_screeninfo var;
        struct fb_fix_screeninfo fix;
        fb_screeninfo(int n = -1): fb(n), isvalid(false), fbdev(""), var({0}), fix({0}) //ctor
        {
//            memset(this, 0, sizeof(*this));
//debug("clr m_info");
//            if (n < 0) fbdev = ""; else
            snprintf(fbdev, sizeof(fbdev), "/dev/fb%d", n);
        }
//add a few convenience functions:
        decltype(var.xres) xtotal() const { return var.xres + var.left_margin + var.hsync_len + var.right_margin; }
        decltype(var.yres) ytotal() const { return var.yres + var.upper_margin + var.vsync_len + var.lower_margin; }
        auto /*uint32_t*/ frtime() const { return rdiv(xtotal() * ytotal() * var.pixclock, 1e6); } //usec
        /*auto uint32_t*/ float fps() const { return 1e6 / frtime(); }
    } m_info;
    using screeninfo_t = decltype(m_info);
    using pixclock_t = decltype(m_info.var.pixclock);
//    pixclock_t get_pixclock(int fd); //fwd def
//allow caller to override some timing params (for dev/debug):
    std::string m_timing; //persistent storage so caller can reuse buffer
private: //ctor/dtor; private to prevent multiple instances
//    CFG() { timing(shell("vcgencmd hdmi_timings")); } //debug("CFG ctor"); } //ls .")); //get RPi timing
    CFG()
    {
//try to find a valid framebuffer:
//start at highest (assume dpi > hdmi)
        for (int i = 4-1; i >= 1-1; --i)
        {
            fb(i);
            if (m_info.isvalid) break;
        }
    }
    ~CFG() {} //debug("CFG dtor"); }
//public: //singleton:
//  static void* operator new(size_t sz) { void* m = malloc(sz); return m; }
//  static void operator delete(void* m) { free(m); }
public: //properties
//read-only properties:
    inline bool noGUI() const { return isatty(fileno(stdin)); } //https://stackoverflow.com/questions/13204177/how-to-find-out-if-running-from-terminal-or-gui
    NAPI_EXPORT_PROPERTY(CFG, noGUI);
    inline bool isXWindows() const { return (nvl(getenv("DISPLAY"))[0] == ':'); } //is XWindows running
    NAPI_EXPORT_PROPERTY(CFG, isXWindows);
    inline bool isXTerm() const { return !!getenv("TERM"); }
    NAPI_EXPORT_PROPERTY(CFG, isXTerm);
    inline bool isSSH() const { return !!getenv("SSH_CLIENT"); }
    NAPI_EXPORT_PROPERTY(CFG, isSSH);
    inline bool isRPi() const { return fexists("/boot/config.txt"); }
    NAPI_EXPORT_PROPERTY(CFG, isRPi);
//    inline const screeninfo_t screeninfo() const { return(&m_info); }
//read/write props:
    inline int fb() const { return m_info.isvalid? m_info.fb: -1; }
    void fb(int n) //allow caller to select which display device to use
    {
        new (&m_info) fb_screeninfo(n); //re-init; placement new to call ctor
        if (!fexists(m_info.fbdev)) return; //silently ignore non-existent devices
        int fd = open(m_info.fbdev, O_RDWR);
        if (fd <= 0) RETURN(errmsg("can't open fb#%d '%s'", n, m_info.fbdev));
        if (ioctl(fd, FBIOGET_FSCREENINFO, &m_info.fix) < 0) errmsg("can't get fb#%d fixed info", n);
        else if (ioctl(fd, FBIOGET_VSCREENINFO, &m_info.var) < 0) errmsg("can't get fb#%d var info", n);
        else if (!get_pixclock(fd)) errmsg("can't get fb#%d pixclock", n);
        else m_info.isvalid = true;
        debug("cfg fb%d '%s': xres %'d + %'d+%'d+%'d = xtotal %'d, yres %'d + %'d+%'d+%'d = ytotal %'d, pixclock %'d psec (%'d KHz) => %3.1f fps, valid? %d", m_info.fb, m_info.fbdev, m_info.var.xres, m_info.var.left_margin, m_info.var.hsync_len, m_info.var.right_margin, m_info.xtotal(), m_info.var.yres, m_info.var.upper_margin, m_info.var.vsync_len, m_info.var.lower_margin, m_info.ytotal(), m_info.var.pixclock, (int)psec2KHz(m_info.var.pixclock), m_info.fps());
        close(fd);
    }
    NAPI_EXPORT_PROPERTY(CFG, fb, fb); //allow Javascript to select which fb
    inline const screeninfo_t* screeninfo() const { return &m_info; }
    inline auto isvalid() const { return m_info.isvalid; }
    inline auto fbdev() const { return m_info.fbdev; }
    inline auto xres() const { return m_info.var.xres; }
    inline auto xleft() const { return m_info.var.left_margin; }
    inline auto xsync() const { return m_info.var.hsync_len; }
    inline auto xright() const { return m_info.var.right_margin; }
    inline auto xtotal() const { return m_info.xtotal(); }
    inline auto yres() const { return m_info.var.yres; }
    inline auto yleft() const { return m_info.var.upper_margin; }
    inline auto ysync() const { return m_info.var.vsync_len; }
    inline auto yright() const { return m_info.var.lower_margin; }
    inline auto ytotal() const { return m_info.ytotal(); }
    inline auto pixclock() const { return m_info.var.pixclock; }
    inline auto fps() const { return m_info.fps(); } //psec2KHz(m_info.var.pixclock); }
//TODO: are these of interest to JavaScript? probably not
//fix: smem_start, smem_len, ywrapstep, line_length, mmio_start, mmio_len, accel, capabilities
//var: xres_virtual, yres_virtual, xoffset, yoffset, bits_per_pixel, red.*, green.*, blue.*, transp.*, height, width, accel_flags, sync
    NAPI_EXPORT_PROPERTY(CFG, isvalid);
    NAPI_EXPORT_PROPERTY(CFG, fbdev);
    NAPI_EXPORT_PROPERTY(CFG, xres);
    NAPI_EXPORT_PROPERTY(CFG, xtotal);
    NAPI_EXPORT_PROPERTY(CFG, yres);
    NAPI_EXPORT_PROPERTY(CFG, ytotal);
    NAPI_EXPORT_PROPERTY(CFG, pixclock);
    NAPI_EXPORT_PROPERTY(CFG, fps);
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
        if (!nvl(str)[0]) //just clear and return
        {
            if (m_info.isvalid) fb(m_info.fb); //restore screen real info
            RETURN(m_timing.clear());
        }
        int xres, xsync, xfront, xback, yres, yfront, ysync, yback, fps, clock;
        xres = xsync = yres = ysync = fps = clock = 0;
        xfront = xback = yfront = yback = 0;
//        int xfront = 0, xback = 0, yfront = 0, yback = 0;
        int ignore, polarity = 0, aspect = 0;
//RPi dpi_timings from /boot/config.txt
//example:  861 0 1 1 1  363 0 2 3 2  0 0 0  30 0 9600000 8
        int nvals = nvl(str)[0]? sscanf(str, "%d %d %d %d %d  %d %d %d %d %d  %d %d %d  %d %d %d %d",
            &xres, &ignore, &xfront, &xsync, &xback,
            &yres, &ignore, &yfront, &ysync, &yback,
            &ignore, &ignore, &ignore, &fps, &polarity, &clock, &aspect): 0;
//printf("timing: nvals %d, str '%s'\n", nvals, nvl(str, "(empty)"));
        if (/*nvals &&*/ (nvals != 17)) RETURN(clear_error(), errmsg("invalid timing: '%s' (found %d vals, expected 17)", nvl(str, "(empty)"), nvals));
//no        xsync += xfront + xback; //consolidate for simpler calculations
//no        ysync += yfront + yback;
        clock /= 1e3; //KHz
        debug(/*CYAN_MSG*/ "timing override: hres %'d + %'d+%'d+%'d, yres %'d + %'d+%'d+%'d, fps %'d, clk %'d KHz", xres, xfront, xsync, xback, yres, yfront, ysync, yback, fps, clock);
        m_timing = str;
        m_info.var.xres = xres;
        m_info.var.left_margin = xfront;
        m_info.var.hsync_len = xsync;
        m_info.var.right_margin = xback;
        m_info.var.yres = yres;
        m_info.var.upper_margin = yfront;
        m_info.var.vsync_len = ysync;
        m_info.var.lower_margin = yback;
        m_info.var.pixclock = psec2KHz(clock);
        if (fps != m_info.fps()) RETURN(clear_error(), errmsg("ignoring fps %d: doesn't match calculated fps %4.3f", fps, m_info.fps()));
    }
//    using test = decltype(/*std::result_of<*/NULL_OF(CFG)->timing())/*>::type*/;
//    static_assert(!std::is_integral<test>::value);
//    static_assert(!std::is_floating_point<test>::value);
//    static_assert(!std::is_arithmetic<test>::value);
//    static_assert(std::is_string<test>::value);
    NAPI_EXPORT_PROPERTY(CFG, timing, timing);
#endif //1
public: //methods
    static bool wait4sync(int fbfd)
    {
        int arg = 0;
        if (ioctl(fbfd, FBIO_WAITFORVSYNC, &arg) >= 0) return true;
        return errmsg(false, "wait4sync failed");
    }
private: //helpers
    pixclock_t m_pxclk_cache[10] = {0};
    pixclock_t get_pixclock(int fd)
    {
        if (m_info.var.pixclock) return m_info.var.pixclock;
        int cache_slot = clamp(m_info.fb, SIZEOF(m_pxclk_cache));
//        if ((m_info.fb >= 0) && (m_info.fb < SIZEOF(pxclk_cache)))
        if ((cache_slot == m_info.fb) && m_pxclk_cache[cache_slot])
            return m_info.var.pixclock = m_pxclk_cache[cache_slot];
        int frames = 0;
        struct timeval start, finish; //timeval;
//        debug("measuring fb#%d pixclock ...", m_info.fb);
        if (!wait4sync(fd)) return 0; //wait until start of next frame
        if (gettimeofday(&start, 0)) return 0; //fatal("gettimeofday %#p", &tz);
//        long elapsed = -(timeval.tv_sec * 1e6 + timeval.tv_usec); //usec
        static constexpr int NUMFR = 40; //CAUTION: elapsed time must stay under ~ 2 sec to avoid overflow; 40 frames @60Hz ~= 667K, @30Hz ~= 1.3M, @20Hz == 2M usec
        while (frames++ < NUMFR) if (!wait4sync(fd)) return 0;
        if (gettimeofday(&finish, 0)) return 0; //fatal("gettimeofday %#p", &tz);
//        elapsed += timeval.tv_sec * 1e6 + timeval.tv_usec; //usec
        unsigned long elapsed = (finish.tv_sec - start.tv_sec) * 1e6 + finish.tv_usec - start.tv_usec; //usec
//CAUTION: avoid overflow by ordering ops to stay within valid range
//xtotal ~500, ytotal ~400 => elapsed * 1e3 needs to be < 2e9
//elapsed <= 2M usec * 1e3 == 2e9; stays within uint32 limit
//then / ~500 * 1e3 ~= 4e9; getting close to overflow!
//then / ~400 / 40 ~= 2e6; in the clear
        m_info.var.pixclock = elapsed * 1e3 / m_info.xtotal() * 1e3 / m_info.ytotal() / --frames;
//        if ((unsigned long)-1 / frames . elapsed * 1e3 / m_info.xtotal() * 1e3 )
        debug("measured fb#%d pixclock: %'d frames x %'d xtotal x %'d ytotal / %'d usec => %'u psec pix clock", m_info.fb, frames, m_info.xtotal(), m_info.ytotal(), elapsed, m_info.var.pixclock);
        return m_pxclk_cache[cache_slot] = m_info.var.pixclock;
    }
    NAPI_STOP_EXPORTS(CFG); //public
};
CFG& cfg = CFG::singleton();
NAPI_EXPORT_OBJECT(cfg); //don't export ctor/class wrapper, just instance


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


//FB low-level I/O:
//2 scenarios:
//- if XWindows is running, emulate FB using SDL window
//- if running in console, use FB/stdio
//NOTE: caller always sees ARGB byte order; FB class will swap byte order internally if needed
#define LAZY_TEXTURE //don't create until caller uses pixels
class FBIO
{
    NAPI_START_EXPORTS(FBIO);
//    using __CLASS__ = FBIO; //in lieu of built-in g++ macro
//check for XWindows, DEFER TO Std FB functions:
//FB not working with XWindows (also tried xorg FB driver) :(
//    /*static*/ const /*bool*/int CFG.isXWindows = (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
//    constexpr const int DDIRTY = 2; //true; //double buffer requires 2 repaints? (1x/buffer)
    /*bool*/ int m_dirty; //= false;
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
public: //properties
    inline bool dirty() const { return !!m_dirty; }
//TODO?    void dirty(int now_dirty) { m_dirty = now_dirty; } //custom dirty repaint
    inline void dirty(bool now_dirty) { m_dirty = now_dirty? 2: 0; } //compensate for double buffering?
    NAPI_EXPORT_PROPERTY(FBIO, dirty, dirty);
public: //ctors/dtors
#ifdef HAS_SDL
 #pragma message(CYAN_MSG "using SDL2 to emulate FB" ENDCOLOR_NOLINE)
    FBIO(): sdl_window(sdl_window), sdl_mode(sdl_mode), sdl_renderer(sdl_renderer), sdl_texture(sdl_texture), m_pixels(m_pixels), m_dirty(m_dirty) {} //kludge: need to satisfy compiler, but avoid overwriting already-initialized data
//    {
//        myPropDesc<FBIO> prop("dirty", myPropDesc<FBIO>::property, &FBIO::NAPWRAPG(dirty), &FBIO::NAPWRAPS(dirty));
//debug("FBIO: dirty getter %#p, setter %#p", prop.getter, prop.setter);
//        debug("FBIO ctor %lu:%'d x %lu:%'d, wnd %lu:%p, rend %lu:%p, txtr %lu:%p, px %lu:%p, dirty %lu:%d", sizeof(sdl_mode.w), sdl_mode.w, sizeof(sdl_mode.h), sdl_mode.h, sizeof(sdl_window), sdl_window, sizeof(sdl_renderer), sdl_renderer, sizeof(sdl_texture), sdl_texture, sizeof(m_pixels), m_pixels, sizeof(m_dirty), m_dirty); //, &sdl_mode);
//    }
protected: //SDL not working with FB, so emulate it here  :(
//TODO: use constexpr?
    static const int FAKED_FD() { return 1234; } //CAUTION: use static method to avoid init order problem (fb_open needs this value)
private:
    SDL_Window* sdl_window; //= 0;
    SDL_DisplayMode sdl_mode; //= {0}; //CAUTION: do not re-init after calling FB delegated ctor
    SDL_Renderer* sdl_renderer; //= 0;
    SDL_Texture* sdl_texture; //= 0;
    uint32_t* m_pixels; //= 0;
protected:
    template <typename ... ARGS>
    int fb_open(ARGS&& ... args)
    {
//debug("fb_open");
//        memset(&sdl_mode, 0, sizeof(sdl_mode)); //must be init before calling delegated ctor
        debug("fb_open: CFG.isXWindows? %lu:0x%x, Disp '%s', !xW? %lu:0x%x", sizeof(cfg.isXWindows()), (int)cfg.isXWindows(), nvl(getenv("DISPLAY"), "(none)"), sizeof(!cfg.isXWindows()), !(int)cfg.isXWindows()); //, sizeof(broken_CFG.isXWindows()));
        if (!cfg.isXWindows())
        {
            dirty(false); //m_dirty = 0;
            memset(&sdl_mode, 0, sizeof(sdl_mode)); //kludge: init for !CFG.isXWindows() case
            int op = open(std::forward<ARGS>(args) ...); //perfect forward
            struct fb_var_screeninfo vdata;
            if ((op > 0) && (ioctl(op, FBIOGET_VSCREENINFO, &vdata) >= 0))
            {
                sdl_mode.w = vdata.xres;
                sdl_mode.h = vdata.yres;
            }
            return op;
        }
//        debug("!try sdl? 0x%x ... using SDL on XW", !CFG.isXWindows());
        clear_error();
        SDL_Init(SDL_INIT_VIDEO);
        SDL_SetHint(SDL_HINT_RENDER_VSYNC, "1"); //use video sync to avoid tear
        SDL_SetHint(SDL_HINT_RENDER_DRIVER, "RPI"); //in case RPI is not first on list
        int dispinx = 0; //default first screen
        sscanf(nvl(getenv("DISPLAY"), ":0"), ":%d", &dispinx); //) dispinx = 0; //default first screen
//        static int once = 0;
//        if (!once++)
//        {
#if 0 //debug info
        debug("#disp: %d, #modes: %d", SDL_GetNumVideoDisplays(), SDL_GetNumDisplayModes(dispinx));
        for (int i = 0, limit = SDL_GetNumVideoDrivers(); i < limit; ++i)
            debug("video driver[%d/%d]: '%s'", i, limit, SDL_GetVideoDriver(i));
        SDL_Rect r = {0};
        if (!SDL_OK(SDL_GetDisplayBounds(0, &r))) return errmsg("SDL_GetDisplayBounds");
        debug("disp rect: (%'d, %'d), (%'d, %'d)", r.x, r.y, r.w, r.h);
#endif
//        }
        dirty(false);
//        SDL_DisplayMode mode;
        if (!SDL_OK(SDL_GetCurrentDisplayMode(dispinx, &sdl_mode))) return errmsg("SDL_GetDisplayMode [%d]", dispinx);
        debug("video drvr '%s', disp mode: %d bpp, %s %'d x %'d", nvl(SDL_GetCurrentVideoDriver(), "(none)"), SDL_BITSPERPIXEL(sdl_mode.format), SDL_GetPixelFormatName(sdl_mode.format), sdl_mode.w, sdl_mode.h); //should match "tvservice -s"
//NOTE: will cre full screen if !XWindows (W + H ignored)
        if (cfg.timing()[0])
        {
//CAUTION: minimize timing override at this level; used here only to set SDL window size
            sdl_mode.w = cfg.xtotal(); //xres + cfg.xfront + cfg.xsync + cfg.xback; //show hblank in window
            sdl_mode.h = cfg.ytotal(); //yres + cfg.yfront + cfg.ysync + cfg.yback;
            if (cfg.isXWindows()) { sdl_mode.w *= 2; sdl_mode.h *= 2; } //kludge: undo /2 below
        }
#pragma message(SYAN_MSG "redo this")
        const int X = cfg.isXWindows()? sdl_mode.w / 10: SDL_WINDOWPOS_UNDEFINED, Y = cfg.isXWindows()? sdl_mode.h / 10: SDL_WINDOWPOS_UNDEFINED;
//for XWindows (dev), use part of screen; else use entire screen
        const int W = /*timovr.xres? timovr.xres:*/ cfg.isXWindows()? multiple(sdl_mode.w / 2, 16): /*640*/sdl_mode.w, H = /*timovr.yres? timovr.yres:*/ cfg.isXWindows()? sdl_mode.h / 2: /*480*/sdl_mode.h;
        const int flags = SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC;
        if (!SDL_OK(SDL_CreateWindowAndRenderer(W, H, flags, &sdl_window, &sdl_renderer))) return errmsg("SDL_CreateWindowAndRenderer");
        sdl_mode.w = W; sdl_mode.h = H; //requested size
        char title[100];
        sprintf(title, "GPU %'d x %'d", sdl_mode.w, sdl_mode.h);
        (void)SDL_SetWindowTitle(sdl_window, title);
//errmsg(PINK_MSG "SDL_CreateWindowAndRenderer");
        SDL_RendererInfo rinfo;
        if (!SDL_OK(SDL_GetRendererInfo(sdl_renderer, &rinfo))) return errmsg("SDL_GetRendererInfo %#p", sdl_renderer);
        debug("renderer %#p: name '%s', flag 0x%x, #fmts %d, maxw %'d, maxh %'d", sdl_renderer, rinfo.name, rinfo.flags, rinfo.num_texture_formats, rinfo.max_texture_width, rinfo.max_texture_height);
#ifndef LAZY_TEXTURE
//don't need texture until caller uses pixels:
        constexpr int acc = SDL_TEXTUREACCESS_STATIC; //_STREAM?; //don't need to lock if using separate pixel array + VSYNC?
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
//debug("fb_open OK(%d): %'d x %'d, wnd %p, rend %p, txtr %p, px %p, dirty %d", FAKED_FD(), sdl_mode.w, sdl_mode.h, sdl_window, sdl_renderer, sdl_texture, m_pixels, m_dirty); //, &sdl_mode);
        return FAKED_FD(); //fake fd (success)
    }
//fill with color:
//NOTE: direct to texture (no pixel array)
#if 1 //broken: flickers back and forth when in wait loop
private:
    int fb_clear(uint32_t ext_color)
    {
        clear_error();
//debug("clear window 0x%x = r x%x, g x%x, b x%x, a x%x", ext_color, R_G_B_A(ext_color));
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
        clear_error();
        if (!cfg.isXWindows()) return close(fd);
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
        clear_error();
        if (!cfg.isXWindows()) return ioctl(fd, cmd, data);
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
//                debug("ioctl: get var info, %'d x %'d, %d bpp %s", vp->xres, vp->yres, vp->bits_per_pixel, fmt);
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
        clear_error();
//        using rettype = uint8_t*; //void*; //needs size
        if (!cfg.isXWindows()) return mmap(addr, len, prot, flags, fd, ofs);
        if (fd != FAKED_FD()) return errmsg(MAP_FAILED, "unknown mmap file: %d (wanted FB %d)", fd, FAKED_FD());
        size_t numpx = sdl_mode.h * sdl_mode.w; // * sizeof(m_pixels[0]);
        if (prot != (PROT_READ | PROT_WRITE)) return errmsg(MAP_FAILED, "unknown mmap prot: 0x%x (wanted 0x%x)", prot, PROT_READ | PROT_WRITE);
        if (flags != MAP_SHARED) return errmsg(MAP_FAILED, "unknown flags: 0x%x (wanted 0x%x)", flags, MAP_SHARED);
        if (sizeof(m_pixels[0]) != 4) return errmsg(MAP_FAILED, "pixel bad size: %d", sizeof(m_pixels[0]));
        if (len < numpx * sizeof(m_pixels[0])) return errmsg(MAP_FAILED, "mmap too short: %'d (wanted >= %'d)", len, numpx * sizeof(m_pixels[0]));
#ifdef LAZY_TEXTURE
        constexpr int acc = SDL_TEXTUREACCESS_STATIC; //_STREAM?; //don't need to lock if using separate pixel array + VSYNC?
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
        clear_error();
        if (!cfg.isXWindows()) return munmap(addr, len);
        if (addr != m_pixels) return errmsg(-1, "unknown mmap addr: %#p (wanted FB %#p)", addr, m_pixels);
        if (m_pixels) delete[] m_pixels; m_pixels = 0; dirty(false);
#ifdef LAZY_TEXTURE
        if (sdl_texture) SDL_DestroyTexture(sdl_texture); sdl_texture = 0;
#endif //def LAZY_TEXTURE
        return 0; //success
    }
    int fb_get_pxclk() const //no-kHz, psec
    {
//CAUTION: minimize timing override at this level; used here only to get px clock if !available elsewhere
        int clk_ovr = cfg.timing()[0]? psec2KHz(cfg.pixclock()): 0; //psec / 1e3: 0;
        int rr = sdl_mode.refresh_rate? sdl_mode.refresh_rate: 60; //Hz
        int retval = 1e12 / (rr * sdl_mode.w * sdl_mode.h); //psec
debug("get px clk: ref rate %'d, w %'d, h %'d => px clk %'d KHz (%'d psec), override %'d KHz (%'d psec)", sdl_mode.refresh_rate, sdl_mode.w, sdl_mode.h, psec2KHz(retval), retval, psec2KHz(clk_ovr), clk_ovr);
        return clk_ovr? clk_ovr: retval? retval: psec2KHz(19.2e3); //assume VGA (19.2MHz) if SDL doesn't know
    }
#else //def HAS_SDL
    FBIO(): sdl_texture({0}), m_pixels(0), m_dirty(0)
    PERFWD(fb_open, ::open);
    PERFWD(fb_mmap, ::mmap);
    PERFWD(fb_ioctl, ::ioctl);
    PERFWD(fb_munmap, ::munmap);
    PERFWD(fb_close, ::close);
    int fb_get_pxclk() const { return 19.2e3; } //TODO
#endif //def HAS_SDL
    NAPI_STOP_EXPORTS(FBIO); //public
};
//CAUTION: doesn't work on RPi unless initialized outside FBIO
//#if 1
// /*static*/ const /*bool*/int FBIO::CFG.isXWindows = (nvl(getenv("DISPLAY"))[0] == ':'); //is XWindows running
//const int FBIO::CFG.isRPi = fexists("/boot/config.txt");
//#endif


//FB open/close wrapper:
//auto-close when done
class FB: public FBIO //: public fb_screeninfo
{
    NAPI_START_EXPORTS(FB, FBIO);
public: //??
//    using __CLASS__ = FB; //in lieu of built-in g++ macro
    using fd_t = int; //m_fd_nocvref = std::remove_cvref<decltype(m_fd)>::type;
//    using msec_t = decltype(time2msec()); //long int;
    const fd_t m_fd = 0;
    const msec_t m_started = now();
public: //typedefs
//just give caller one struct to deal with:
    /*static*/ struct fb_screeninfo
    {
        struct fb_var_screeninfo var;
        struct fb_fix_screeninfo fix;
//        fb_screeninfo(): var({0}), fix({0}) {} //{ memset(this, 0, sizeof(*this)); } //debug("clr m_info"); } //ctor
//add a couple of convenience functions:
        decltype(var.xres) xtotal() const { return var.xres + var.left_margin + var.hsync_len + var.right_margin; }
        decltype(var.yres) ytotal() const { return var.yres + var.upper_margin + var.vsync_len + var.lower_margin; }
    } m_info;
    using screeninfo_t = decltype(m_info);
//    struct fb_screeninfo& m_info = *this;
public: //ctors/dtors
    explicit FB(): FB("/dev/fb0") {} //debug("FB ctor 1"); }
    explicit FB(const char* name): FB(fb_open(name, O_RDWR)) {} //debug("FB ctor 2"); }
    explicit FB(fd_t fd): m_info({0}) //: m_fd(0), m_started(now())
    {
        clear_error();
//debug("FB ctor 3");
//debug("fb fd %lu:%d, started@ %lu:%'d, elapsed %lu:%'d", sizeof(fd), fd, sizeof(m_started), m_started, sizeof(elapsed()), elapsed());
//debug("cur disp mode: %d bpp, %s %'d x %'d", SDL_BITSPERPIXEL(sdl_mode.format), SDL_GetPixelFormatName(sdl_mode.format), sdl_mode.w, sdl_mode.h); //should match "tvservice -s"
        if (!isOpen(fd)) RETURN(errmsg("fb open"));
//just get it once; assume won't change:
        if (fb_ioctl(fd, FBIOGET_VSCREENINFO, &m_info.var) < 0) RETURN(errmsg("get var screen info"));
        if (fb_ioctl(fd, FBIOGET_FSCREENINFO, &m_info.fix) < 0) RETURN(errmsg("get fix screen info"));
//NOTE: okay to use timing overrides at this level
//alas, this is backwards; should use RPi dpi_timings and emulate with FBIOGET_VSCREENINFO, not vice versa :(
        if (cfg.timing()[0])
        {
#pragma message("fix this")
#if 0
            m_info.var.xres = cfg.xres;
            m_info.var.left_margin = cfg.xfront;
            m_info.var.hsync_len = cfg.xsync;
            m_info.var.right_margin = cfg.xback;
            m_info.var.yres = cfg.yres;
            m_info.var.upper_margin = cfg.yfront;
            m_info.var.vsync_len = cfg.ysync;
            m_info.var.lower_margin = cfg.yback;
            m_info.var.pixclock = psec2KHz(cfg.clock); //KHz => psec
debug("FB ctor timing override: cfg clk %'d (KHz) -> px clk %'d (psec)", cfg.clock, m_info.var.pixclock);
#endif
        }
        if (!m_info.var.pixclock) m_info.var.pixclock = fb_get_pxclk();
//        if (!m_info.var.pixclock) RETURN(errmsg("get pixel clock"));
        *(fd_t*)&m_fd = fd; //set Open status only after getting screen info; bypass "const" within ctor
    }
    ~FB() { if (isOpen()) fb_close(m_fd); }
public: //operators
    explicit inline operator fd_t() const { return(m_fd); } //debug("int fd %d", m_fd); return(m_fd); }
//    explicit operator const decltype(m_info)* () { return screeninfo(); }
public: //getters/setters
    static inline msec_t now() { return(time2msec()); }
    inline msec_t elapsed() const
    {
//debug("elapsed: %'d - %'d = %'d", now(), m_started, now() - m_started);
        return(now() - m_started);
    }
    void elapsed(msec_t new_elapsed)
    {
        msec_t old_elapsed = elapsed();
        *(msec_t*)&m_started += old_elapsed - new_elapsed; //bypass "const"
//reset frame count as well; preserve frame rate:
        sync_good = old_elapsed? new_elapsed * sync_good / old_elapsed: 0;
        sync_errs = old_elapsed? new_elapsed * sync_errs / old_elapsed: 0;
//also idle time:
        m_slept = old_elapsed? new_elapsed * m_slept / old_elapsed: 0;
    }
//static_assert(std::is_integral<decltype(NULL_OF(FB)->elapsed())>::value);
//static_assert(!std::is_floating_point<decltype(NULL_OF(FB)->elapsed())>::value);
//static_assert(!std::is_string<decltype(NULL_OF(FB)->elapsed())>::value);
    NAPI_EXPORT_PROPERTY(FB, elapsed, elapsed);
public: //methods
    inline bool isOpen() const { return(isOpen(m_fd)); }
    NAPI_EXPORT_PROPERTY(FB, isOpen);
    inline static bool isOpen(fd_t fd) { return(fd && (fd != -1)); }
    inline const auto /*decltype(m_info)**/ screeninfo() const { return(&m_info); }
//wait for video sync:
//allows very simple timing control; GPU controls caller's frame update rate
    msec_t m_slept = 0; //total time spent waiting for vsync; use for perf tuning
    inline msec_t slept() const { return m_slept; }
    inline void slept(msec_t newtime) { m_slept = newtime; }
    NAPI_EXPORT_PROPERTY(FB, slept, slept);
    int sync_good = 0, sync_errs = 0; //won't ever wrap @60 fps
    inline int numfr() const { return(sync_good + sync_errs); }
    NAPI_EXPORT_PROPERTY(FB, numfr);
    inline double fps() const { msec_t elaps = elapsed(); return(elaps? 1e3 * numfr() / elaps: 0); } //actual
    NAPI_EXPORT_PROPERTY(FB, fps);
    int frtime() const //theoretical, msec
    {
        if (!m_info.var.pixclock) return (clear_error(), errmsg(1e3 / 60, "get pixel clock"));
//        int xtotal = m_info.var.left_margin + m_info.var.xres + m_info.var.right_margin + m_info.var.hsync_len;
//        int ytotal = m_info.var.upper_margin + m_info.var.yres + m_info.var.lower_margin + m_info.var.vsync_len;
        int retval = m_info.var.pixclock? rdiv(m_info.xtotal() * m_info.ytotal(), psec2KHz(m_info.var.pixclock)): 0; //psec => msec
//debug("xtotal %'d, ytotal %'d, px clock %'d => frtime %'d msec", xtotal, ytotal, m_info.var.pixclock, retval);
        return(retval? retval: 1e3 / 60); //kludge: return 1/60 sec if missing data
    }
    NAPI_EXPORT_PROPERTY(FB, frtime);
    bool wait4sync() //bool delay_on_error = true)
    {
//        if (fbfd < 0) return -1;
//debug("wait4sync: op? %d, #good %'d, #errs %'d, frtime %'d, elapsed %'d", isOpen(), sync_good, sync_errs, frtime(), elapsed());
        if (isOpen())
        {
            int arg = 0;
            m_slept -= now();
            if (fb_ioctl(m_fd, FBIO_WAITFORVSYNC, &arg) >= 0) { m_slept += now(); return(++sync_good); } //true
            ++sync_errs; //only count errors if open
        }
        /*if (delay_on_error)*/ usleep(frtime() * 1e3); //wait 1/60 sec to maintain caller timing
        return(false); //error or !open
    }
#ifdef USING_NAPI
    Napi::Value await4sync_method(const Napi::CallbackInfo& info)
    {
        auto async_exec = [this]() -> bool
        {
            return wait4sync();
        };
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
        const msec_t wakeup = now() + msec; //TODO: use last sync timestamp?
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
#ifdef USING_NAPI
    Napi::Value awaitsec_method(const Napi::CallbackInfo& info)
    {
//debug("async method: #args %d, arg[0] %s", info.Length(), NapiType(info[0]));
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "seconds (Number) expected; got %s", NapiType(info.Length()? info[0]: info.Env().Undefined()));
        int delay_msec = info[0].As<Napi::Number>().Int32Value() * 1e3;
//TODO: reuse awaitmsec_method?
        auto async_exec = [this, delay_msec]() -> bool
        {
            return wait_msec(delay_msec);
        };
        NAPI_ASYNC_RETURN(async_exec);
    }
    Napi::Value awaitmsec_method(const Napi::CallbackInfo& info)
    {
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "milliseconds (Number) expected; got %s", NapiType(info.Length()? info[0]: info.Env().Undefined()));
//        const auto delay_msec = info[0].As<Napi::Number>().Int32Value();
        int delay_msec = info[0].As<Napi::Number>().Int32Value();
        auto async_exec = [this, delay_msec]() -> bool
        {
            return wait_msec(delay_msec);
        };
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


//wrapper for 2D addressing:
//NOTE: doesn't use array of arrays but looks like it
//parent manages all memory
//2D singleton: data is in parent
//instances are created in-place (overlaid onto target memory); must be 0 size
//static data is used to avoid instance data; a tag parameter is used to allow multiple instances of static data
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
//debug("ary@ %p at limit check: %lu inx vs. (limit %p - this %p) / chsize %lu", this, inx, m_limit, this, child_size());
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


//memory-mapped FB pixels:
//auto-close (unmap) when done
//template</*int BPP = 4,*/ bool BOUNDS_CHECK = true>
class FBPixels: public FB
{
    NAPI_START_EXPORTS(FBPixels, FB);
//    using __CLASS__ = FBPixels; //in lieu of built-in g++ macro
public: //typedefs
    static constexpr int CACHELEN = 64; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both
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
    const size_t m_rowlen32, m_height; //CAUTION: horizontal raster lines might be padded, so store effective width
    const size_t m_numpx; //slightly WET to reduce run-time bounds checking :(
public: //ctors/dtors
//CAUTION (init order): pixels has dependencies
    explicit FBPixels(/*int fd = 0*/): FB(/*fd*/), m_px(m_px_init()), pixels(*(/*std::remove_reference<pixels>::type*/row_t*)m_px), m_dummy(0), m_rowlen32(screeninfo()->fix.line_length / 4), m_height(screeninfo()->/*var.yres*/ytotal()), m_numpx(m_rowlen32 * m_height) //NOTE: incl vblank to match underlying framebuffer, even though unused
//broken    PERFWD_CTOR(explicit FBPixels, FB), m_px(m_px_init()), pixels(*(ary<ary<data_t>>*)m_px), m_dummy(0), m_rowlen32(screeninfo()->fix.line_length / 4), m_height(screeninfo()->var.yres), m_numpx(m_rowlen32 * m_height)
    {
        clear_error();
//        debug("FBPixels::ctor, isOp? %d, color %lu bytes", isOpen(), sizeof(m_px[0]));
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
#if 0
        auto scrinfo = screeninfo();
        debug("(color masks 8-bit, byte aligned, little endian) red: %'d:+%'d^%'d, green: %'d:+%'d^%'d, blue: %'d:+%'d^%'d, xpar: %'d:+%'d^%'d, xofs %'d, yofs %'d",
            scrinfo->var.red.length, scrinfo->var.red.offset, scrinfo->var.red.msb_right,
            scrinfo->var.green.length, scrinfo->var.green.offset, scrinfo->var.green.msb_right,
            scrinfo->var.blue.length, scrinfo->var.blue.offset, scrinfo->var.blue.msb_right,
            scrinfo->var.transp.length, scrinfo->var.transp.offset, scrinfo->var.transp.msb_right,
            scrinfo->var.xoffset, scrinfo->var.yoffset);
#endif
//        size_t new_height = screeninfo()->var.yres;
//        size_t new_rowlen32 = screeninfo()->fix.line_length / 4; //NOTE: might be larger than screen hres due to padding
//        size_t new_numpx = new_height * new_rowlen32; //only set size if mmap successful; NOTE: might be larger than screen hres due to padding
//        if (new_rowlen32 != screeninfo()->var.xres) debug(YELLOW_MSG "CAUTION: raster rowlen32 %'lu != width %'d", new_rowlen32, screeninfo()->var.xres);
//        if (new_height * new_rowlen32 * 4 != screeninfo()->fix.smem_len) debug(YELLOW_MSG "CAUTION: raster size %'lu != calc %'d", new_height * new_rowlen32 * 4, screeninfo()->fix.smem_len);
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
        col_t::m_len = m_rowlen32;
debug("FBPixels::ctor: mmap@ %#p, bpp %d, size %'lu (info says %'d), rowlen32(w) %'lu, h %'lu, #px %'lu, pxrow[0]@ %#p, pxrow[1]@ %#p, pxeof[h %'lu]@ %#p", m_px, bpp(),  m_height * m_rowlen32 * 4, screeninfo()->fix.smem_len, m_rowlen32, m_height, m_numpx, &pixels[0], &pixels.at(1), m_height, &pixels[m_height]);
//no; leave contents intact        memset(m_px, 0, m_numpx * BPP()); //start all transparent black
    }
    ~FBPixels()
    {
        clear_error();
        debug("FBPixels::dtor");
//        if (m_rowpx) delete m_rowpx; //m_rowpx = 0;
        if (m_numpx && (fb_munmap((color_t*)m_px, m_numpx * 4) == -1)) errmsg("px munmap");
    }
    FBPixels(const FBPixels& that): m_px(0), pixels(*(row_t*)m_px), m_dummy(0), m_rowlen32(0), m_height(0), m_numpx(0) { *this = that; } //avoid [-Weffc++] warning
private: //ctor helpers (member init)
    color_t* m_px_init()
    {
        auto scrinfo = screeninfo();
        size_t width = scrinfo->xtotal(); //scrinfo->var.xres + scrinfo->var.left_margin + scrinfo->var.hsync_len + scrinfo->var.right_margin;
        size_t height = scrinfo->ytotal(); //scrinfo->var.yres + scrinfo->var.upper_margin + scrinfo->var.vsync_len + scrinfo->var.lower_margin;
        size_t rowlen32 = scrinfo->fix.line_length / 4; //NOTE: might be larger than screen hres due to padding
        if (rowlen32 != width) debug(YELLOW_MSG "CAUTION: raster rowlen32 %'lu != scr width %'d + %'d+%'d+%'d", rowlen32, scrinfo->var.xres, scrinfo->var.left_margin, scrinfo->var.hsync_len, scrinfo->var.right_margin);
        if (height * rowlen32 * 4 != scrinfo->fix.smem_len) debug(YELLOW_MSG "CAUTION: raster size %'lu != scr mem len %'d", height * rowlen32 * 4, scrinfo->fix.smem_len);
        SDL_SetError("(potential multi-CPU contention)");
        if ((rowlen32 * 4) % CACHELEN) debug(YELLOW_MSG "row len !multiple of cache size %'d: 0x%lx", CACHELEN, rowlen32 * 4);
        return isOpen()? (color_t*)fb_mmap((void*)0, height * rowlen32 * 4, PROT_READ | PROT_WRITE, MAP_SHARED, (int)*this, 0): (color_t*)MAP_FAILED; //shared with GPU
    }
public: //operators
    FBPixels& operator=(const FBPixels& that) { return *this = that; } //[-Weffc++]
public: //getters/setters
    inline size_t width() const { return(m_rowlen32); } //screeninfo()->var.xres); }
    NAPI_EXPORT_PROPERTY(FBPixels, width);
    inline size_t height() const { return(m_height); } //screeninfo()->var.yres); }
    NAPI_EXPORT_PROPERTY(FBPixels, height);
    inline /*auto*/ int bpp() const { return(screeninfo()->var.bits_per_pixel); } //bits
    NAPI_EXPORT_PROPERTY(FBPixels, bpp);
    inline /*auto*/ int BPP() const { return(screeninfo()->var.bits_per_pixel / 8); } //bytes
//public: //methods
//NOTE: compiler should be smart enough to optimize out unneeded checks:
#if 1
    row_t& pixels; //2D pixel array access; at() bounds check, "[]" no bounds check
//    data_t& operator() (size_t x, size_t y) { return m_buf[x + y * h]; }
//    inline bool inbounds(size_t xyinx) const { return(/*BOUNDS_CHECK?*/ (xyinx < m_numpx)); }
    inline bool inbounds(size_t x, size_t y) const { return(/*!BOUNDS_CHECK ||*/ ((x < m_rowlen32) && (y < m_height))); }
    inline size_t xyinx(size_t x, size_t y) const { return(inbounds(x, y)? y * m_rowlen32 + x: m_numpx); } //? m_numpx: -1); } //-1); } //CAUTION: invalid index should also fail bound check, but should still allow use as upper limit
//    data_t& pixel(size_t x, size_t y) { return(inbounds(x, y)? m_px[xyinx(x, y)]: m_dummy); } //rd/wr
    inline color_t& pixel(size_t x, size_t y, color_t color) { dirty(true); return pixel(x, y) = color; } //rd/wr
    inline color_t& pixel(size_t x, size_t y) { return pixels.at(y).at(x); } //return m_buf[x + y * ary<ary<data_t>>::m_len]; }
//    const data_t& pixel(size_t x, size_t y) const { return(inbounds(x, y)? m_px[xyinx(x, y)]: 0); } //rd-only
    inline color_t& pixel(size_t ofs) { return pixels[0].at(ofs); } //return(inbounds(ofs)? m_px[ofs]: m_dummy); } //rd/wr
//    const data_t& pixel(size_t ofs) const { return(inbounds(ofs)? m_px[ofs]: 0); } //rd-only
#else
//(x, y) access to pixels (intended for low-volume usage):
    bool inbounds(size_t x, size_t y) const { return(!BOUNDS_CHECK || ((x < m_rowlen32) && (y < m_height))); }
    size_t xyinx(size_t x, size_t y) const { return(inbounds(x, y)? y * m_rowlen32 + x: m_numpx); } //? m_numpx: -1); } //-1); } //CAUTION: invalid index should also fail bound check, but should still allow use as upper limit
    color_t& pixel(size_t x, size_t y) { return(pixel(xyinx(x, y))); } //rd/wr
    const color_t& pixel(size_t x, size_t y) const { return(pixel(xyinx(x, y))); } //rd-only
//linear/array access to pixels:
//NOTE: caller can ignore padding because width is compensated
//    bool inbounds(size_t ofs) const { return(BOUNDS_CHECK? (ofs < m_numpx): m_numpx); }
    color_t& pixel(size_t ofs) { return(inbounds(ofs)? m_px[ofs]: m_dummy); } //rd/wr
    const color_t& pixel(size_t ofs) const { return(inbounds(ofs)? m_px[ofs]: 0); } //rd-only
#endif
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
        auto arybuf = Napi::ArrayBuffer::New(info.Env(), pxbuf, w * h * sizeof(*pxbuf)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        for (uint32_t y = 0; y < h; ++y)
        {
            int len = y? w: (h - y) * w; //allow caller to use linear addresses on first row; TODO: allow on other rows also?
            auto rowary = Napi::TypedArrayOf<uint32_t>::New(info.Env(), len, arybuf, y * w * sizeof(*pxbuf), napi_uint32_array); ////https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
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
        size_t ixy = xyinx(x, y);
//debug("inx %lu", ixy);
//help caller to debug indexing errors (assumes low bandwidth):
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber() || (ixy == (size_t)-1) || ((info.Length() > 2) && !info[2].IsNumber())) return err_napi(info.Env(), "x 0..%'d, y 0..%'d, optional color (all Numbers) expected", width() - 1, height() - 1);
        if (info.Length() > 2)
        {
            const auto color = info[2].As<Napi::Number>().Uint32Value();
//debug("color 0x%x", color);
            pixel(ixy) = color;
            dirty(true);
        }
        return Napi::Number::New(info.Env(), pixel(ixy));
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
        for (size_t i = 0; i < m_numpx; ++i) m_px[i] = color; //.uint32;
        dirty(true);
    }
#ifdef USING_NAPI
    Napi::Value fill_method(const Napi::CallbackInfo& info)
    {
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "color (Number) expected");
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
        for (size_t i = xyinx(0, y), limit = xyinx(0, y + 1); i < limit; ++i) m_px[i] = color; //.uint32;
//        int sv_dirty = dirty();
        dirty(true);
//        debug("dirty %d -> %d", sv_dirty, dirty());
    }
#ifdef USING_NAPI
    Napi::Value row_method(const Napi::CallbackInfo& info)
    {
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber()) return err_napi(info.Env(), "row index 0..%'d, color (both Numbers) expected", height() - 1);
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
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber()) return err_napi(info.Env(), "column index 0..%'d, color (both Numbers) expected", width() - 1);
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
template<> STATIC size_t FBPixels::row_t::m_len = 0;
template<> STATIC FBPixels::color_t* FBPixels::row_t::m_limit = 0;
template<> STATIC const char* FBPixels::row_t::item_type = "pixel row";
template<> STATIC size_t FBPixels::col_t::m_len = 0;
template<> STATIC FBPixels::color_t* FBPixels::col_t::m_limit = 0;
template<> STATIC const char* FBPixels::col_t::item_type = "pixel col";


///////////////////////////////////////////////////////////////////////////////
////
/// 24-channel parallel port
//

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
                    debug("fake mem[%#p/%'lu] = 0x%x", it.first, MAXSIZE, it.second);
    }
};
#endif

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
//RPi CPU is not that faster either, so the fewer screen pixels the better
//NOTE: RGB bit/byte order doesn't matter - just swap channels

class Pivot24: public FBPixels
{
    NAPI_START_EXPORTS(Pivot24, FBPixels);
    enum { NUMCH = 24}; //fixed limit; uses all RGB bits
public:
    using data_t = uint32_t; //uint8_t; //use quad bytes to allow denser indexing
    using col_t = ary<Pivot24, data_t>;
    using row_t = ary<Pivot24, col_t, data_t>;
private:
    size_t m_chqbytes; //#quadbytes/channel
    data_t* m_chdata; //CAUTION: pivot buf != pixel buf; pivot buf uses separated bit-channels
//need to be able to switch pxrender after instantiation (based on ppb results)
//pass func ptrs manually rather than trying to use virt funcs and recasting
//can't get member function working; try static function instead:
//broken    /*virtual*/ static size_t rowlen_init(const FB::screeninfo_t* scrinfo); //m_chqbytes_init() //decltype needs fwd ref :(
//    using rowlen_init_t = decltype(&Pivot24::rowlen_init); //NULL_OF(Pivot24)->rowlen_init());
//    typedef size_t (Pivot24::*rowlen_init_t)(void);
public: //ctor/dtor
//    typedef size_t (Pivot24::*rowlen_init_t)();
//    Pivot24(/*int fd = 0,*/ rowlen_init_t rlinit = &Pivot24::rowlen_init): FBPixels(/*fd*/), m_chqbytes((*rlinit)()), m_chdata(isOpen()? new data_t[NUMCH * m_chqbytes]: 0), channels(*(/*std::remove_reference<channels>::type*/row_t*)m_chdata)
    typedef size_t (*rowlen_init_t)(const FB::screeninfo_t*);
    Pivot24(/*int fd = 0,*/ rowlen_init_t rlinit = &rowlen_init): FBPixels(/*fd*/), m_chqbytes((*rlinit)(screeninfo())), m_chdata(isOpen()? new data_t[NUMCH * m_chqbytes]: 0), channels(*(/*std::remove_reference<channels>::type*/row_t*)m_chdata)
//    Pivot24(/*int fd = 0*/): FBPixels(/*fd*/), m_chqbytes(rowlen_init()), m_chdata(isOpen()? new data_t[NUMCH * m_chqbytes]: 0), channels(*(/*std::remove_reference<channels>::type*/row_t*)m_chdata)
//    template<typename ... ARGS>
//    Pivot24(/*int fd = 0,*/ARGS&& ... args): FBPixels(/*fd*/), m_chqbytes(std::forward<ARGS>(args) ...), m_chdata(isOpen()? new data_t[NUMCH * m_chqbytes]: 0), channels(*(/*std::remove_reference<channels>::type*/row_t*)m_chdata)
    {
        clear_error();
        if (!m_chdata) RETURN(errmsg("alloc channel bytes"));
//NOTE: must be set before using pixels.at()
        row_t::m_limit = col_t::m_limit = m_chdata + NUMCH * m_chqbytes;
        row_t::m_len = NUMCH;
        col_t::m_len = m_chqbytes;
        debug("Pivot24 ctor: alloc %'lu bytes/channel = %'lu bytes total @%#p, isopen? %d", m_chqbytes * sizeof(data_t), NUMCH * m_chqbytes * sizeof(data_t), m_chdata, isOpen());
    }
    ~Pivot24() { if (m_chdata) delete m_chdata; }
private: //ctor helpers (member init)
    static constexpr int B2b = 8; //8 bits/byte
//g++ gives "cannot be overloaded" error with fwd ref, so move actual func def to here as work-around
    /*virtual*/ static size_t rowlen_init(const FB::screeninfo_t* scrinfo) //m_chqbytes_init()
    {
//summary: total screen/window width (incl hblank) * vis screen/window height (excl vblank) / 32 = #quadbytes/channel needed
        clear_error();
debug("Pivot24::rowlen_init()");
//        auto scrinfo = screeninfo();
        if (!scrinfo->var.pixclock) return errmsg(1, "get bit clock");
//NOTE: hblank counts because it interleaves visible data (bits will be 0 during hblank); vblank !counted because occurs at end of frame
//        size_t xtotal = scrinfo->var.left_margin + scrinfo->var.xres + scrinfo->var.right_margin + scrinfo->var.hsync_len;
        size_t chqbytes = (divup(divup(scrinfo->xtotal() * scrinfo->var.yres, sizeof(data_t) * B2b) * sizeof(data_t), CACHELEN) * CACHELEN) / sizeof(data_t); //bits -> bytes; minimize cache contention for mult-threaded apps
//TODO: remove target limit; WS281x supercedes it
        constexpr int ws_usec = 30; //30 usec/WS281x node
        constexpr int ws_bits = 24; //24 data bits/WS281x node
        constexpr int ppb = 8; //desired #pixels to represent 1 data bit
        constexpr int limit = 1e6 / 20 / ws_usec * ws_bits * ppb; //target limit ~ 1667 WS281x 24-bit nodes @20 fps, render each data bit with 8 px => 320k px/channel/frame = 40KB/ch/fr
        int kludge = psec2KHz(scrinfo->var.pixclock); //printf shows wrong value (bad optimization?); store in separate var to help it
debug("Pivot24 chqbytes: (hres %'d + hblank %'d) * vres %'d = %'d bit times/ch/fr = %'d bytes/ch/fr, pad^ %'d => %'lu bytes/channel, target limit %'d bit times/ch/fr (%'d bytes), bit clk %'d psec (%'d KHz)", scrinfo->var.xres, scrinfo->xtotal() - scrinfo->var.xres, scrinfo->var.yres, scrinfo->xtotal() * scrinfo->var.yres, divup(scrinfo->xtotal() * scrinfo->var.yres, B2b), CACHELEN, divup(divup(scrinfo->xtotal() * scrinfo->var.yres, B2b), CACHELEN) * CACHELEN, limit, divup(limit, B2b), scrinfo->var.pixclock, kludge); //psec2KHz(scrinfo->var.pixclock));
#if 1
        if (!chqbytes || (chqbytes * sizeof(data_t) * B2b > limit)) /*return errmsg(99,*/ errmsg(YELLOW_MSG "channel bitmap length %'lu bytes out of expected range (0 .. %'d)", chqbytes * sizeof(data_t) * B2b, limit);
#endif
        return chqbytes;
    }
public: //properties
    inline int numch() const { return NUMCH; }
    NAPI_EXPORT_PROPERTY(Pivot24, numch);
    inline int bitclk() const { return screeninfo()->var.pixclock; } //psec
    NAPI_EXPORT_PROPERTY(Pivot24, bitclk);
    size_t chbits() const { return m_chqbytes * sizeof(data_t) * B2b; } //NOTE: could be padded
    NAPI_EXPORT_PROPERTY(Pivot24, chbits);
public: //methods
    row_t& channels; //2D channel byte array access; at() bounds check, "[]" no bounds check
    inline bool inbounds(size_t ch, size_t ofs) const { return((ch < NUMCH) && (ofs < m_chqbytes)); }
    inline size_t xyinx(size_t ch, size_t ofs) const { return(inbounds(ch, ofs)? ch * m_chqbytes + ofs: NUMCH * m_chqbytes); } //CAUTION: invalid index should also fail bound check, but should still allow use as upper limit
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
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber() || /*(ixy == (size_t)-1) ||*/ ((info.Length() > 2) && !info[2].IsNumber())) return err_napi(info.Env(), "ch 0..%'d, ofs 0..%'d, optional bits (all Numbers) expected", NUMCH - 1, m_chqbytes *sizeof(data_t) * B2b - 1);
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
        if ((info.Length() < 2) || !info[0].IsNumber() || !info[1].IsNumber() || (ixy == (size_t)-1) || ((info.Length() > 2) && !info[2].IsNumber())) return err_napi(info.Env(), "ch 0..%'d, delay 0..%'d, optional bits (all Numbers) expected", NUMCH - 1, m_chqbytes - 1);
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
        auto retval = Napi::Array::New(info.Env(), h);
        auto arybuf = Napi::ArrayBuffer::New(info.Env(), chbuf, w * h * sizeof(*chbuf)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        for (uint32_t y = 0; y < h; ++y)
        {
            int len = y? w: (h - y) * w; //allow caller to use linear addresses on first row; TODO: allow on other rows also?
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
        msec_t started = now();
        if (!bits) memset(m_chdata, 0, NUMCH * m_chqbytes * sizeof(data_t));
        else for (size_t i = 0; i < NUMCH * m_chqbytes; ++i) m_chdata[i] = bits;
debug("fill(0x%x) %'lu qbytes took %'d msec (excl refresh)", bits, NUMCH * m_chqbytes, now() - started);
        dirty(true);
    }
#ifdef USING_NAPI
    Napi::Value fill_method(const Napi::CallbackInfo& info)
    {
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "bit mask (Number) expected");
        const auto bits = info[0].As<Napi::Number>().Uint32Value();
        fill(bits); //updates pixel array in memory
        return info.Env().Undefined(); //Napi::Number::New(info.Env(), 0);
    }
    NAPI_EXPORT_METHOD(Pivot24, "fill", fill_method);
#endif //def USING_NAPI
//flush dirty channel data and wait:
    bool out_msec() { return out_msec(0); }
    bool out_msec(int msec)
    {
        if (dirty()) pivot24();
        return wait_msec(msec);
    }
#ifdef USING_NAPI
    Napi::Value awaitout_method(const Napi::CallbackInfo& info)
    {
//debug("async method: #args %d, arg[0] %s", info.Length(), NapiType(info[0]));
        if (info.Length() && !info[0].IsNumber()) return err_napi(info.Env(), "milliseconds (Number) expected; got %s", NapiType(info.Length()? info[0]: info.Env().Undefined()));
//        const auto delay_msec = info[0].As<Napi::Number>().Int32Value();
        int delay_msec = info.Length()? info[0].As<Napi::Number>().Int32Value(): 0;
        auto async_exec = [this, delay_msec]() -> bool
        {
            return out_msec(delay_msec);
        };
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
#endif
//undo R<->B swap during pivot:
//makes debug easier; no impact to live usage (just swap the wires)
//bit order is 0x80..1,0x8000..0x100,0x800000..0x10000 when red + blue swapped
#if 1
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
#else //all bits in order
    template <int N>
    struct bitmasks { enum { bit = 1 << ((23 - N) % 8) }; }
#endif
//check that all RGB bits are accounted for:
//implicitly checks bitmasks[] size also
    static_assert(SIZEOF(bitmasks) == NUMCH, RED_MSG "bitmasks[] wrong size");
    static_assert(bitmasks_OR<SIZEOF(bitmasks)>::bits == RGBbits(::WHITE), RED_MSG "missing RGB bits in bitmasks[]" ENDCOLOR_NOLINE);
//kludge: CPU needs to do this for now; RPi GPU mem access too slow?
//NOTE: pivot src buf (chbuf) is 75% of pxbuf because it generates RGB, not A
//    virtual /*inline*/ void pxrender(int x, FBPixels::color_t*& px24ptr, data_t chqbits[SIZEOF(bitmasks)])
    /*virtual*/ static /*inline*/ void pxrender(int xy, FBPixels::color_t*& px24ptr, data_t chqbits[SIZEOF(bitmasks)])
    {
        static constexpr int count = 0; //TODO: pass in?
        int& m_debug_pivot = static_m_debug_pivot(); //kludge: create l-value
//        *px24ptr++ = pivot24; //1:1 24 qbits become 1 pixel (pivoted)
        if (m_debug_pivot) //show channel bits to pivot
            for (int ch = 0; ch < NUMCH; ++ch)
                if (chqbits[ch]) debug("to pivot: chqbits[%'d][%'d] = 0x%x", ch, xy, chqbits[ch]);
//TODO: unwind loop at compile-time?
        for (uint32_t bit = 0x80000000; bit; bit >>= 1)
        {
//CAUTION: a lot of memory accesses here; could slow things down
            color_t px24 = //Abits(::WHITE) | //0xFF000000 |
                ((chqbits[0] & bit)? bitmasks[0]: 0) |
                ((chqbits[1] & bit)? bitmasks[1]: 0) |
                ((chqbits[2] & bit)? bitmasks[2]: 0) |
                ((chqbits[3] & bit)? bitmasks[3]: 0) |
                ((chqbits[4] & bit)? bitmasks[4]: 0) |
                ((chqbits[5] & bit)? bitmasks[5]: 0) |
                ((chqbits[6] & bit)? bitmasks[6]: 0) |
                ((chqbits[7] & bit)? bitmasks[7]: 0) |

                ((chqbits[8] & bit)? bitmasks[8]: 0) |
                ((chqbits[9] & bit)? bitmasks[9]: 0) |
                ((chqbits[10] & bit)? bitmasks[10]: 0) |
                ((chqbits[11] & bit)? bitmasks[11]: 0) |
                ((chqbits[12] & bit)? bitmasks[12]: 0) |
                ((chqbits[13] & bit)? bitmasks[13]: 0) |
                ((chqbits[14] & bit)? bitmasks[14]: 0) |
                ((chqbits[15] & bit)? bitmasks[15]: 0) |

                ((chqbits[16] & bit)? bitmasks[16]: 0) |
                ((chqbits[17] & bit)? bitmasks[17]: 0) |
                ((chqbits[18] & bit)? bitmasks[18]: 0) |
                ((chqbits[19] & bit)? bitmasks[19]: 0) |
                ((chqbits[20] & bit)? bitmasks[20]: 0) |
                ((chqbits[21] & bit)? bitmasks[21]: 0) |
                ((chqbits[22] & bit)? bitmasks[22]: 0) |
                ((chqbits[23] & bit)? bitmasks[23]: 0);
//if ((count < 3) && new24) debug("^%p ('%'lu) <- 0x%x", bp24, )
#if 1
//            if ((px24ptr < &pixels[0][0]) || (px24ptr >= &pixels[height()][0]))
//                RETURN(errmsg("pivot loop[%'d/%'d] bad: bp24 %px vs. pixels@ %p..%p", x, m_chqbytes, px24ptr, px24));
            if (Abits(px24)) RETURN(clear_error(), errmsg("pivot turned on non-RGB bit: 0x%x", Abits(px24)));
//            if (m_debug_pivot && RGBbits(px24)) debug("pivoted qb[%'d]/px[%'d of %'d] = 0x%x doing bit 0x%x", x, px24ptr - &pixels[0][0], &pixels[NUMCH][0]) - &pixels[0][0], px24, bit);
#endif
//if (new24 || (x == 7)) debug("loop[%'d/%'d]: ^%p++ (ofs %'d) = 0x%x", x, m_chqbytes, bp24, bp24 - &pixels[0][0], new24);
//TODO?            if (px24) ++non0s;
//            if (m_debug_pivot && px24) debug("pivot[%'d]: qb[%'d]/px[%'d] = 0x%x", count, x, px24ptr - &pixels[0][0], px24);
//            (*m_pxrender)(px24ptr, px24 | Abits(::WHITE));
            *px24ptr++ = px24 | Abits(::WHITE); //1:1 into to output px (but pivoted)
        }
    }
//    /*typedef*/ inline void (*m_pxrender)(FBixels::color_t* px24ptr, FBPixels::color_t pivot24);
//    using pxrender_t = decltype(NULL_OF(Pivot24)->pxrender(*NULL_OF(FBPixels::color_t), 0));
//    FBPixels::color_t* dummy_ptr; //kludge: decltype() wants params :(
    using pxrender_t = decltype(&pxrender); //(dummy_ptr, 0));
//based on https://stackoverflow.com/questions/22291737/why-cant-decltype-work-with-overloaded-functions
//#define ARGTYPES(func)  \
//template<typename... ARGS>  \
//using TestType = decltype(func(std::declval<ARGS>()...))(ARGS...)
//    typedef /*inline*/ static void (::*pxrender_t)(FBPixels::color_t*& px24ptr, FBPixels::color_t pivot24);
protected:
    pxrender_t m_pxrender = &pxrender;
//TODO: use STATIC_WRAP?
//    static int m_debug_pivot; //= 0;
    STATIC_WRAP(int, m_debug_pivot, = 0);
private:
    void pivot24()
    {
        static int count = 0; //only for debug
//if (count < 3) debug("pivot[%'d] start", count);
//if (count < 3) debug("#qloop %'lu x 32 = %'lu bits = %'lu bytes = %'lu px", m_chqbytes, 32 * m_chqbytes, 4 * 32 * m_chqbytes, 4 * 32 * m_chqbytes / 3);
//if (count < 3) debug("chbuf@ %p, ch[0][0]@ %p, ch[24][0]@ %p, bitmask[0] 0x%x, bitmask[23] 0x%x", m_chdata, &channels[0][0], &channels[24][0], bitmasks[0], bitmasks[23]);
using ptr_state = std::pair<int, size_t>; //color_t*>;
//std::vector<ptr_state> ptr_hist;
//ptr_state ptr_hist[10];
//size_t ptr_count = 0;
        int non0s = 0;
        msec_t started = now();
        color_t* bp24 = &pixels[0][0]; //start at top left
        color_t* const endpx = std::min(&pixels[0][chbits()], &pixels[height()][0]); //bottom right limit, according to qbytes and screen geometry
//        debug("px limit: ch[0][%'d] %#p vs px[%'d][0] %#p => %#p", chbits(), &pixels[0][chbits()], height(), &pixels[height()][0], endpx);
//        FakePtr<color_t, 64> bp24 = m_pixels;
        for (int xy = 0; xy < m_chqbytes; ++xy) //fill L2R, T2B
        {
//localize mem access for next block of 32 bits (perf):
            data_t chqbits[SIZEOF(bitmasks)]; //1 qbyte per channel
            for (int ch = 0; ch < SIZEOF(chqbits); ++ch) chqbits[ch] = channels[ch][xy];
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
            if ((bp24 < &pixels[0][0]) || (bp24 >= endpx)) //&pixels[0][m_chqbytes])) //out of bounds
            {
//                int s = ptr_count; //ptr_hist.size();
//                debug("x/ofs: %'d/%'lu, %'d/%'lu, %'d/%'lu, %'d/%'lu ... ", ptr_hist[4+0].first, ptr_hist[4+0].second, ptr_hist[4+1].first, ptr_hist[4+1].second, ptr_hist[4+2].first, ptr_hist[4+2].second, ptr_hist[4+3].first, ptr_hist[4+3].second);
//                debug("x/ofs: ... %'d/%'lu, %'d/%'lu, %'d/%'lu, %'d/%'lu", ptr_hist[(s+0)&3].first, ptr_hist[(s+0)&3].second, ptr_hist[(s+1)&3].first, ptr_hist[(s+1)&3].second, ptr_hist[(s+2)&3].first, ptr_hist[(s+2)&3].second, ptr_hist[(s+3)&3].first, ptr_hist[(s+3)&3].second);
                RETURN(clear_error(), errmsg("pivot loop[%'d/%'d] bad: bp24 %#p vs. pixels@ %#p..%#p", xy, m_chqbytes, bp24, &pixels[0][0], endpx)); //&pixels[0][m_chqbytes], ptr_count));
            }
            color_t* oldbp24 = bp24;
            (*m_pxrender)(xy, bp24, chqbits); //render next block of px
#if 1 //debug
//NOTE: pxrender() knows about the RGB values being rendered, so it can check for stray bits
//here we just check the RGB bits for 0/non-0
            while (oldbp24 < bp24) //check new px values that were rendered
            {
                if (RGBbits(*oldbp24)) ++non0s;
                if (m_debug_pivot && RGBbits(*oldbp24)) debug("pivot[%'d]: qb[%'d/%'d]/px[%'d/%'d] = 0x%x", count, xy, m_chqbytes, oldbp24 - &pixels[0][0], endpx - &pixels[0][0], *oldbp24);
                ++oldbp24;
            }
#endif
        }
        if (!m_debug_pivot) return;
        --m_debug_pivot; //auto turn off
        msec_t elapsed = now() - started;
//if (count < 3) debug("pivot[%'d]: px@ %p + %'lu qbytes => pxe@ %p (=+%'lu), %'lu msec", count, &pixels[0][0], m_chqbytes, bp24, bp24 - &pixels[0][0], elapsed);
        debug("pivot[%'d]: px@ %#p + %'lu qbytes => pxe@ %#p (=+%'lu), %'lu trailing px, #non-0s %'d, %'lu msec", count++, &pixels[0][0], m_chqbytes, bp24, bp24 - &pixels[0][0], endpx - bp24, non0s, elapsed);
//if (count < 3) bp24.dump();
    }
    NAPI_STOP_EXPORTS(Pivot24); //public
};
NAPI_EXPORT_CLASS(Pivot24);
//CAUTION: static class members need init value in order to be found; overwrite later
//int Pivot24::m_debug_pivot = 0;
template<> STATIC size_t Pivot24::row_t::m_len = 0;
template<> STATIC Pivot24::data_t* Pivot24::row_t::m_limit = 0;
template<> STATIC const char* Pivot24::row_t::item_type = "channel";
template<> STATIC size_t Pivot24::col_t::m_len = 0;
template<> STATIC Pivot24::data_t* Pivot24::col_t::m_limit = 0;
template<> STATIC const char* Pivot24::col_t::item_type = "channel qbyte";


///////////////////////////////////////////////////////////////////////////////
////
/// WS281X protocol formatter
//

//generate WS281X data signal:
//works similar to Pivot24, but implements WS281x protocol:
//- formats bit data (adds bit start + stop) into data stream
//- 24 bits per node
//NOTE: vblank interval serves as 50 usec WS281x refresh signal
//for YALP, also adds frame# and checksum into data stream
//NOTE: theoretically could be layered on top of Pivot24, but due to limited RPi resources (mem + CPU speed), this is a customized/slimmed down version of Pivot24 instead
//template <int PPB>
class WS281x: public Pivot24
{
    NAPI_START_EXPORTS(WS281x, Pivot24);
//    enum { WSBITS = 24 }; //predetermined by protocol; 24 bits/node
    static constexpr int WSBITS = 24; //predetermined by protocol; 24 bits/node
//    enum { WSTIME = 30 }; //predetermined by WS281x protocol; 30usec/wsnode
    static constexpr double WSTIME = 30e-6; //predetermined by WS281x protocol; 30usec/wsnode
//    enum { PPB = 8}; //use 8 px to render each WS281x data bit
//public:
    using wsnode_t = Pivot24::data_t; //uint32_t; //RGB color for each WS281x node; top 8 bits ignored - could be used for app-level blending
//    using col_t = ary<WS281x, wsnode_t>;
//    using row_t = ary<WS281x, col_t, wsnode_t>;
//private:
////TODO: use STATIC_WRAP?
//    static int m_ppb; //#px used to render each WS281x data bit
    STATIC_WRAP(int, m_ppb, = 0); //kludge: univlen_init() is static so this must be also
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
    WS281x(/*int fd = 0*/): Pivot24(/*fd,*/ &univlen_init) {} //, univlen_init(), (m_ppb == 8)? wsrender_8ppb: 0)
//    {
//        debug("WS281x ctor: alloc %'lu nodes/channel = %'lu bytes total", univlen(), NUMCH * univlen() * sizeof(wsnode_t));
//    }
private: //ctor helpers (member init)
//    virtual size_t rowlen_init()
    /*virtual*/ static size_t univlen_init(const FB::screeninfo_t* scrinfo) //m_chqbytes_init()
    {
        clear_error();
        int& m_ppb = static_m_ppb(); //kludge: create l-value
debug("ws univlen init");
//        auto scrinfo = screeninfo();
        if (!scrinfo->var.pixclock) return errmsg("get bit clock"); //psec
//NOTE: hblank counts because it interleaves visible data (bits will be 0 during hblank); vblank !counted because occurs at end of frame
        static constexpr int psec2usec = 1e6; //psec => usec
        static constexpr int modchk = 100; //scale up while checking fractions
        m_ppb = modchk * psec2usec * WSTIME / WSBITS / scrinfo->var.pixclock; // / WSTIME * (scrinfo->var.pixclock * 1e3) / WSBITS;
//        if (mod(WSTIME * scrinfo->var.pixclock * 1e3, WSBITS))
        if (m_ppb % modchk) errmsg(YELLOW_MSG "non-integral %3.2f px/bit could result in timing jitter", (double)m_ppb / modchk); //WSTIME * scrinfo->var.pixclock * 1e3 / WSBITS);
        m_ppb = rdiv(m_ppb, modchk); //scale back to true value
//        if (ppb != PPB) return errmsg("wrong ppb: %'d usec wsnode time / %'d KHz bit clk => %'d ppb (compiled for %d", WSTIME, scrinfo->var.pixclock, ppb, PPB);
//        size_t xtotal = scrinfo->var.left_margin + scrinfo->var.xres + scrinfo->var.right_margin + scrinfo->var.hsync_len;
        size_t vblank = scrinfo->var.upper_margin + scrinfo->var.vsync_len + scrinfo->var.lower_margin;
//debug("%'d xtotal, %'d vblank", xtotal, vblank);
        size_t univlen = ((scrinfo->xtotal() * scrinfo->var.yres / WSBITS / m_ppb) * sizeof(wsnode_t) / CACHELEN) * CACHELEN / sizeof(wsnode_t); //bits -> bytes; minimize cache contention for mult-threaded apps
//        constexpr int limit = 1.0 / 20 / WSTIME; //target limit ~ 1667 WS281x 24-bit nodes @20 fps, render each data bit with 8 px => 320k px/channel/frame = 40KB/ch/fr
debug("WS281x univ: (hres %'d + hblank %'d) * vres %'d = %'d bit times/ch/fr = "
    "%'d wsnode/ch/fr @%'d px/bit, pad^ %'d bytes => %'lu wsnodes/channel, "
//    "target limit %'d wsnodes/ch/fr (%'d bytes), "
    "bit clk %'d KHz (%'d psec), "
    "hblank = %'d ws bits, vblank = %'d usec", 
scrinfo->var.xres, scrinfo->xtotal() - scrinfo->var.xres, scrinfo->var.yres, scrinfo->xtotal() * scrinfo->var.yres, 
scrinfo->xtotal() * scrinfo->var.yres / WSBITS / m_ppb, m_ppb, CACHELEN, univlen, 
//limit, limit * sizeof(wsnode_t), 
psec2KHz(scrinfo->var.pixclock), scrinfo->var.pixclock, 
rdiv(scrinfo->xtotal() - scrinfo->var.xres, m_ppb), (int)rdiv(scrinfo->xtotal() * vblank * scrinfo->var.pixclock, psec2usec));
//protocol limit: signal low (stop bit) must be < 50% data bit time
//this allows ws data stream to span hblank without interruption
        if (scrinfo->xtotal() - scrinfo->var.xres >= m_ppb / 2) errmsg("hblank too long (%'d px): exceeds WS281x 50%% data bit time (%'d px)", scrinfo->xtotal() - scrinfo->var.xres, m_ppb);
        if (!vblank /*(xtotal * vblank) / scrinfo->var.pixclock / 1e3 < 50*/) errmsg("vblank too short (%'d lines): WS281x needs at least 50 usec (1 scan line)", vblank); //, 50e3 * scrinfo->var.pixclock / xtotal);
//        if (!univlen || (univlen > limit)) /*return errmsg(99,*/ errmsg(YELLOW_MSG "univ length %'lu nodes outside expected range (0 .. %'d)", univlen, limit);
//adjust render logic to match screen config:
        switch (m_ppb)
        {
            case 8: /*m_pxrender = &pxrender_8ppb;*/ return univlen;
            case 19: /*m_pxrender = &pxrender_19ppb;*/ return univlen; //dev only
//                if (FBIO::CFG.isRPi && !FBIO::CFG.isXWindows()) break;
        }
        return errmsg(10, "unsupported ppb: %d", static_m_ppb);
    }
//public: //properties
    size_t univlen() const { return &channels[1][0] - &channels[0][0]; } //m_univlen; } //m_chqbytes; } //NOTE: could be truncated
    NAPI_EXPORT_PROPERTY(WS281x, univlen);
//    size_t numch() const { return NUMCH; }
//public: //methods
//aliases:
    inline wsnode_t& wsnode(size_t ch, size_t ofs, wsnode_t color) { return chqbyte(ch, ofs, color); } //rd/wr
    inline wsnode_t& wsnode(size_t ch, size_t ofs) { return chqbyte(ch, ofs); }
//#ifdef USING_NAPI
//    inline Napi::Value wsnode_method(const Napi::CallbackInfo& info) { return Pivot24::chqbyte_method(info); } //alias
    NAPI_EXPORT_METHOD(WS281x, "wsnode", chqbyte_method); //wsnode_method); //alias
//    NAPI_EXPORT_WRAPPED_PROPERTY(Pivot24, "channels", channels_getter);
//#endif //def USING_NAPI
//private: //helpers
//    virtual /*inline*/ void pxrender(int x, FBPixels::color_t*& px24ptr, data_t chqbits[SIZEOF(bitmasks)])
    /*virtual*/ static /*inline*/ void pxrender(int x, FBPixels::color_t*& px24ptr, data_t chqbits[SIZEOF(bitmasks)])
    {
        static constexpr int count = 0; //TODO: pass in?
        int& m_ppb = static_m_ppb(); //kludge: create l-value
        int& m_debug_pivot = static_m_debug_pivot(); //kludge: create l-value
        if (m_debug_pivot) //show channel bits to pivot
            for (int y = 0; y < SIZEOF(chqbits); ++y)
                if (RGBbits(chqbits[y])) debug("to pivot: chqbits[%'d][%'d] = 0x%x", y, x, chqbits[y]);
//TODO: unwind loop at compile-time?
//only bottom 24 bits of wsnodes used TODO: use upper for alpha/blend?
        for (uint32_t bit = 0x800000; bit; bit >>= 1)
        {
//CAUTION: a lot of memory accesses here; slow on RPi
            color_t px24 = //Abits(::WHITE) | //0xFF000000 |
                ((chqbits[0] & bit)? bitmasks[0]: 0) |
                ((chqbits[1] & bit)? bitmasks[1]: 0) |
                ((chqbits[2] & bit)? bitmasks[2]: 0) |
                ((chqbits[3] & bit)? bitmasks[3]: 0) |
                ((chqbits[4] & bit)? bitmasks[4]: 0) |
                ((chqbits[5] & bit)? bitmasks[5]: 0) |
                ((chqbits[6] & bit)? bitmasks[6]: 0) |
                ((chqbits[7] & bit)? bitmasks[7]: 0) |

                ((chqbits[8] & bit)? bitmasks[8]: 0) |
                ((chqbits[9] & bit)? bitmasks[9]: 0) |
                ((chqbits[10] & bit)? bitmasks[10]: 0) |
                ((chqbits[11] & bit)? bitmasks[11]: 0) |
                ((chqbits[12] & bit)? bitmasks[12]: 0) |
                ((chqbits[13] & bit)? bitmasks[13]: 0) |
                ((chqbits[14] & bit)? bitmasks[14]: 0) |
                ((chqbits[15] & bit)? bitmasks[15]: 0) |

                ((chqbits[16] & bit)? bitmasks[16]: 0) |
                ((chqbits[17] & bit)? bitmasks[17]: 0) |
                ((chqbits[18] & bit)? bitmasks[18]: 0) |
                ((chqbits[19] & bit)? bitmasks[19]: 0) |
                ((chqbits[20] & bit)? bitmasks[20]: 0) |
                ((chqbits[21] & bit)? bitmasks[21]: 0) |
                ((chqbits[22] & bit)? bitmasks[22]: 0) |
                ((chqbits[23] & bit)? bitmasks[23]: 0);
//if ((count < 3) && new24) debug("^%p ('%'lu) <- 0x%x", bp24, )
#if 1
//            if ((px24ptr < &pixels[0][0]) || (px24ptr >= &pixels[height()][0]))
//                RETURN(errmsg("pivot loop[%'d/%'d] bad: bp24 %px vs. pixels@ %p..%p", x, univlen(), px24ptr, px24));
            if (Abits(px24)) RETURN(clear_error(), errmsg("pivot turned on non-RGB bit: 0x%x", Abits(px24)));
#endif
//if (new24 || (x == 7)) debug("loop[%'d/%'d]: ^%p++ (ofs %'d) = 0x%x", x, m_chqbytes, bp24, bp24 - &pixels[0][0], new24);
//TODO?            if (px24) ++non0s;
//            if (m_debug_pivot && px24) debug("pivot[%'d]: qb[%'d]/px[%'d] = 0x%x", count, x, px24ptr - &pixels[0][0], px24);
//            (*m_pxrender)(px24ptr, px24 | Abits(::WHITE));
//            *px24ptr++ = px24 | Abits(::WHITE);
            switch (m_ppb)
            {
                case 8: //each wsnode generates 8 px
                    *px24ptr++ = *px24ptr++ = ::WHITE; //ws start bit; only needs to be done 1x
                    *px24ptr++ = *px24ptr++ = *px24ptr++ = px24 | Abits(::WHITE); //ws data bit
                    *px24ptr++ = *px24ptr++ = *px24ptr++ = ::BLACK; //ws stop bit; only needs to be done 1x
                    break;
                case 19: //dev only:
                    for (int i = 0; i < 8; ++i) *px24ptr++ = ::WHITE; //ws start bit; only needs to be done 1x
                    for (int i = 8; i < 12; ++i) *px24ptr++ = px24 | Abits(::WHITE); //ws data bit
                    for (int i = 12; i < 19; ++i) *px24ptr++ = ::BLACK; //ws stop bit; only needs to be done 1x
                    break;
            }
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


NAPI_EXPORT_MODULES(); //export modules to Javascript


///////////////////////////////////////////////////////////////////////////////
////
/// CLI (test jig):
//

#ifndef NODE_API_MODULE //NODE_GYP_MODULE_NAME
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
    debug("px @%#p, row[0] @%#p, row[1] @%#p, px[0][0] @%#p, px[0][1] @%#p, px[1][0] @%#p", &fb.pixels, &fb.pixels[0], &fb.pixels[1], &fb.pixels[0][0], &fb.pixels[0][1], &fb.pixels[1][0]);
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
#endif //ndef NODE_API_MODULE //NODE_GYP_MODULE_NAME

//eof