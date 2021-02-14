//#define color_t  uint32_t
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
#define fromARGB(...)  UPTO_4ARGS(__VA_ARGS__, fromARGB_4ARGS, fromARGB_3ARGS, fromARGB_2ARGS, fromARGB_1ARG) (__VA_ARGS__)
#define fromARGB_1ARG(argb)  fromARGB_4ARGS(Abits(argb)? A(argb): /*RGBbits(argb)? 0xFF: 0*/ 0xFF, R(argb), G(argb), B(argb)) //conditional full alpha
#define fromARGB_2ARGS(a, rgb)  fromARGB_4ARGS(a, R(rgb), G(rgb), B(rgb))
#define fromARGB_3ARGS(r, g, b)  fromARGB_4ARGS(0xFF, r, g, b) //default full alpha
#define fromARGB_4ARGS(a, r, g, b)  ((clamp(a) << A_shift) | (clamp(r) << R_shift) | (clamp(g) << G_shift) | (clamp(b) << B_shift))

//convert back to external (caller) ARGB order from internal (FB) order:
#define toARGB(...)  UPTO_4ARGS(__VA_ARGS__, toARGB_4ARGS, toARGB_3ARGS, toARGB_2ARGS, toARGB_1ARG) (__VA_ARGS__)
#define toARGB_1ARG(color)  (Abits(shiftlr(color, A_shift - 24)) | Rbits(shiftlr(color, R_shift - 16)) | Gbits(shiftlr(color, G_shift - 8)) | Bbits(shiftlr(color, B_shift - 0)))
#define toARGB_4ARGS(a, r, g, b)  ((clamp(a) << 24) | (clamp(r) << 16) | (clamp(g) << 8) | (clamp(b) << 0))


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
#endif //0

//eof