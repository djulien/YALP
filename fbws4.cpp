//WS281X test using Linux framebuffer:
// 1/27/22 no longer depends on device tree overlay - uses run-time config
//NOTE: this code is obsolete; maintained only because it's self-contained
//to build:  gcc fbws.c -o fbws
//to run:  fbws  #(sudo no longer needed)

#include <unistd.h>
#include <stdio.h> //*printf
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <fcntl.h>
#include <linux/fb.h>
#include <sys/mman.h>
#include <sys/ioctl.h>
#include <inttypes.h>
#include <time.h> //struct timespec
#include <sys/time.h> //struct timeval, struct timezone
#include <stdarg.h> //va_args et al

//kludge: including .c here to simplify command line when compiling
//just pulls in the copy from fpp since it is a source-only type lib
//#include "../fpp-djgit/src/util/bcm2835.h"
uint32_t* map_failed = (uint32_t*)MAP_FAILED;
#undef MAP_FAILED
#define MAP_FAILED  map_failed //shim
#include "/opt/fpp/src/util/bcm2835.c"

/////////////////////////////////////////////////////////////////////////////////////
//set these to show bugs:
//#define FIRSTPX_BUG //show problem with first px after vsync
//#define EOL_BUG //show problem with last px before hsync
/////////////////////////////////////////////////////////////////////////////////////


<<<<<<< HEAD
#define FPS  20 //40 // 20 //40 //20
=======
#define FPS  20 //40 //20
>>>>>>> f99a4238755e41b728e6e1eea0ec1d6d98a4a47b
#define WHICHFB  0
#define USE_HBLANK  1 //default if not reported by ioctl
#define USE_VBLANK  11 //default if not reported by ioctl

//#of GPU px to render each WS281X px:
#define PPB  3 //GPU @2.4MHz (bare minimum for WS281X formatting)
//#define PPB 64 //GPU @50 MHz
#ifdef EOL_BUG
 #define NUMPX 250
#else
 #define NUMPX  50 //20 //37 //#WS281X pixels to render
#endif


#define TRUE  1
#define FALSE  0

#ifdef BCK2835_LIBRARY_BUILD
 #define WANT_BCM
#endif


//convert to string + force inner macro expansion:
#define TOSTR(str)  TOSTR_NESTED(str)
#define TOSTR_NESTED(str)  #str //kludge: need nested level to force expansion

#define SRCLINE  " @" TOSTR(__LINE__) "\n"

#define rdiv(num, den)  (((num) + (den) / 2) / (den))


//use globals to reduce param passing:
char* fbp = 0;
int fbfd = -1;
struct my_var_screeninfo: /*struct*/ fb_var_screeninfo
{
//add helpers:
    inline int hblank() const { int retval = left_margin + right_margin + hsync_len; return retval? retval: USE_HBLANK; }
    inline int vblank() const { int retval = upper_margin + lower_margin + vsync_len; return retval? retval: USE_VBLANK; }
    inline int pixfreq() const { return pixclock? rdiv((int)1e9, pixclock): 0; } //psec => KHz
//    inline bool has_pixclock() const { return (pixfreq() >= (int)1e3) && (pixfreq() <= (int)80e3); } //clock freq within expected range
};
/*struct fb*/ my_var_screeninfo vinfo; //variable info (res, clock, etc)
struct fb_fix_screeninfo finfo; //fixed info (shm len, stride, etc)
//#define FBDEV  "/dev/fb0"
//#define FBDEV  "/dev/fb1"
char FBDEV[16];


#define put_pixel  put_pixel_RGB24
void put_pixel_RGB24(int x, int y, int r, int g, int b)
{
    // calculate the pixel's byte offset inside the buffer
    unsigned int pix_offset = x * 3 + y * finfo.line_length;

    // now this is about the same as 'fbp[pix_offset] = value'
    *((char*)(fbp + pix_offset)) = b;
    *((char*)(fbp + pix_offset + 1)) = g;
    *((char*)(fbp + pix_offset + 2)) = r;

}


//sprintf + shell out:
int system_printf(const char* cmd, ...)
{
    char buf[1000];
    va_list argp;
    va_start(argp, cmd);
    int cmdlen = vsnprintf(buf, sizeof(buf), cmd, argp);
    va_end(argp);
    buf[cmdlen] = '\0'; //make sure it's terminated; just truncate command and return an error if it mattered
    printf("executing %s ..." SRCLINE, buf);
    return system(buf);
}


#define fatal(msg)  printf("%s" SRCLINE, msg) //shim; should quit


//convert long long -> uint32 for faster arithmetic:
#define UNITS  (int)1e6
uint32_t elapsed_usec()
{
    struct timeval time_parts;
    if (gettimeofday(&time_parts, NULL)) fatal("get time of day failed");
    uint32_t retval = time_parts.tv_sec * UNITS + time_parts.tv_usec / ((int)1e6 / UNITS); //could wrap but shouldn't matter if taking time diff
    return retval;
}


//wait for next frame:
//synced to GPU (KINDA); seems to be using original GPU speed even after change
void wait4frame(int numfr) // = 0)
{
    uint32_t taken_usec = -elapsed_usec();
    printf("wait %d frames ", numfr);
    int sv_numfr = numfr? numfr: 1;
    while (numfr-- >= 0)
    {
//        uint32_t loop_usec = -elapsed_usec();
        int arg = 0; //must be 0
        if (ioctl(fbfd, FBIO_WAITFORVSYNC, &arg) < 0)
        {
            printf("vsync failed, simulate with sleep" SRCLINE);
            usleep(rdiv((int)1e6, FPS)); //emulate 20 fps; NOT ACCURATE
        }
//        loop_usec += elapsed_usec();
//        printf("... took %d usec" SRCLINE, loop_usec);
    }
    taken_usec += elapsed_usec();
    printf("... took %d usec (%d usec/frame)" SRCLINE, taken_usec, taken_usec / sv_numfr);
}


//measure pix clock:
//(ioctl doesn't seem to give this info)
#define LIMIT  (int)2.5e6 //safe limit before signed wrap
int measure_pxclock()
{
//    struct fb_var_screeninfo vinfo;
//    memset(&vinfo, 0, sizeof(vinfo));
//    if (ioctl(fbfd, FBIOGET_VSCREENINFO, &vinfo))
//      printf("Error reading var information." SRCLINE);
//    uint32_t hsync = vinfo.right_margin + vinfo.hsync_len + vinfo.left_margin;
//    uint32_t vsync = vinfo.lower_margin + vinfo.vsync_len + vinfo.upper_margin;
//    if (!hsync) hsync = USE_HSYNC;
//    if (!vsync) vsync = USE_VSYNC;
//    uint32_t xtotal = vinfo.xres + vinfo.right_margin + vinfo.hsync_len + vinfo.left_margin;
//    if (vinfo.xres != WANT_XRES || xtotal != WANT_XTOTAL) printf("xtotal %d wrong: %d %d %d %d" SRCLINE, xtotal, vinfo.xres, vinfo.right_margin, vinfo.hsync_len, vinfo.left_margin);
//    uint32_t ytotal = vinfo.yres + vinfo.lower_margin + vinfo.vsync_len + vinfo.upper_margin;
//    if (vinfo.yres != WANT_YRES || ytotal != WANT_YTOTAL) printf("ytotal %d wrong: %d %d %d %d" SRCLINE, ytotal, vinfo.yres, vinfo.upper_margin, vinfo.vsync_len, vinfo.lower_margin);
    wait4frame(1); //skip current frame since it might be partial
    uint32_t taken_usec = -elapsed_usec();
#define NUMFR  40 //       CONSTDEF(NUMFR, 40); //CAUTION: elapsed time in usec must stay under ~ 2 sec to avoid overflow; 40 frames @60Hz ~= 667K, @30Hz ~= 1.3M, @20Hz == 2M usec
    wait4frame(NUMFR);
    taken_usec += elapsed_usec();
    printf("elapsed %d, #fr %d, xtotal %u, ytotal %u" SRCLINE, taken_usec, NUMFR, vinfo.xres + vinfo.hblank(), vinfo.yres + vinfo.vblank());
    if (taken_usec > LIMIT) printf("measure_clock: elapsed %d took too long: %'d usec limit %'d" SRCLINE, NUMFR, taken_usec, LIMIT);
//    uint32_t pxclock = taken_usec / NUMFR;
    uint32_t pxclock = rdiv(rdiv(rdiv(taken_usec, NUMFR) * (int)1e3, vinfo.xres + vinfo.hblank()) * (int)1e3, vinfo.yres + vinfo.vblank()); //usec => psec; kludge: split up 1e6 factor to prevent overflow
    vinfo.pixclock = pxclock;
    printf("px clock: %d psec (%3.2f MHz)" SRCLINE, vinfo.pixclock, vinfo.pixfreq()); //1e6 / pxclock);
    return pxclock; //should be 416,667 psec with 2.4 MHz pix clock; 1,997,752 usec / 40 frames / 393 xtotal / 305 ytotal, this@ 0x575f5a8 T+2.070 $0 @yalp-napi.cpp:432
}



//WS281X low, high bit times:
//bit time is 1.25 usec and divided into 3 parts:
//          ______ _______           _____
//   prev  / lead \  data \  trail  / next
//   bit _/        \_______\_______/  bit
//all bits start with low-to-high transition
//"0" bits fall after 1/4 of bit time; "1" bits fall after 5/8 of bit time
//all bits end in a low state

//OpenGL (2nd gen)
//below timing is compliant with *both* W2811 and WS2812:
//this allows them to be interchangeable wrt software
//however, certain types of strips are still subjec to R <-> G swap
#define BIT_0H  16.0/64.0 //middle of common range
//#define BIT_0L  48.0/64.0
#define BIT_1H  36.0/64.0 //middle of common range
//#define BIT_1L  28.0/64.0
#define BIT_TIME  1.28 //64 * 50 MHz pixel clock (rounded up)


//UPDATED TIMING (3rd gen circa 2020)
//original code used 50 MHz pxclock
//parameterized (use PPB) 1/27/22
#define _0H  (1 * PPB / 3) //16
#define _0L  (2 * PPB / 3) //48
#define _1H  (2 * PPB / 3) //36
#define _1L  (1 * PPB / 3) //28
#define _H(b)  ((b)? _1H: _0H)
#define _L(b)  ((b)? _1L: _0L)
//#define BITW(b)  (((b) < 23)? 64: 48) //last bit is partially hidden
//obsolete #define BITW(b)  (((b) < 23)? PPB: PPB*2/3) //last bit is partially hidden
#define nel(ary)  (sizeof(ary) / sizeof((ary)[0]))
#define RGSWAP(rgb24)  ((((rgb24) >> 8) & 0xff00) | (((rgb24) << 8) & 0xff0000) | ((rgb24) & 0xff))

//use low brightness to reduce eye burn during testing:
#define RED  0x020000 //0x1f0000
#define GREEN  0x000200 //0x001f00
#define BLUE  0x000002 //0x00001f
#define YELLOW  0x020200 //0x1f1f00
#define CYAN  0x000202 //0x001f1f
#define MAGENTA  0x020002 //0x1f001f
#define WHITE  0x010101 //0x1f1f1f


//turn console cursor off (interferes with WS281X data):
#define CURSOFF "\x1B[?25l"
#define CURSON "\x1B[?25h"


#ifdef FIRSTPX_BUG
 #pragma message("SHOWING FIRST-PX BUG" SRCLINE);
#endif
#ifdef EOL_BUG
 #pragma message("SHOWING END-OF-LINE BUG" SRCLINE);
#endif

//render WS281X data bits into GPU framebuffer:
void draw(int anim) //int want_blank)
{
    int want_blank = (anim < 0);
    static int frnum = 0;
	uint32_t colors[] = {RGSWAP(RED), RGSWAP(GREEN), BLUE, YELLOW, RGSWAP(CYAN), RGSWAP(MAGENTA), WHITE};
    int hstride32 = finfo.line_length / 4; //bytes -> uint32
	const char* color_names[] = {"R", "G", "B", "Y", "C", "M", "W"};
//for (int i = 0; i < nel(colors); ++i) printf("color[%d/%d]: 0x%x" SRCLINE, i, nel(colors), colors[i]);
//	long int scrsize = vinfo.xres * vinfo.yres * vinfo.bits_per_pixel / 8;
//	memset(fbp, 0, scrsize);
//    {
    printf("anim[%d]: ", anim);
    uint32_t bitofs = 0; //ofs into WS data bit stream (skips over hsync transparently)
#ifdef FIRSTPX_BUG
 #define FIRST  0
#else
 #define FIRST  -1
#endif
#ifdef EOL_BUG
 #define WRONG_GAP 1
#else
 #define WRONG_GAP 0
#endif
    for (int px = FIRST; px < NUMPX; ++px) //WS281X pixel loop
    {
        uint32_t color = (px < 0)? 0: want_blank? 0: (anim > 999)? 0x010101: colors[(px + anim) % nel(colors)];
        printf("%s ", (px < 0)? "-": want_blank? "0": (anim > 999)? "w": color_names[(px + anim) % nel(colors)]);
        for (int b = 0; b < 24; ++b) //WS281X bit loop; NOTE: one of the WS bits can be partially hidden by hsync, depending on alignment within the scan line; check for precise alignment
        {
//		        if (loop == 10) color = 0;
            uint32_t bv = /*want_blank? 0:*/ color & (0x800000 >> b);
            for (int i = 0; i < PPB; ++i) //WS bit fragment loop
            {
                int onoff = (px < 0)? 0: (i < _H(bv))? 0xff: 0;
//			        put_pixel(BITW(0) * b + i, y, onoff, onoff, onoff);
                int x = bitofs % (vinfo.xres + WRONG_GAP), y = bitofs / (vinfo.xres + WRONG_GAP); //NOTE: WS pixel might overflow to next scan line
//                    printf("draw: pixel[%d/%d], wsbit[%d/%d], frag[%d/%d] => bitofs %d, x %d/%d, y %d/%d" SRCLINE, px, NUMPX, b, 24, i, PPB, bitofs, x, vinfo.xres, y, vinfo.yres);
                put_pixel(x, y, onoff, onoff, onoff); ++bitofs;
//if (i == 1) printf(" %d ", i < _H(bv));
//                    if ((bitofs++ - y * (hstride - vinfo.xres)) % vinfo.xres) continue; //!end of line
//#ifndef EOL_BUG
                if (x < vinfo.xres) continue; // !end of line
//                    if (px < 0 && !b && !i) continue; //don't check first time
                if (onoff) printf("config error[px %d, bit %d, frag %d]: writing non-0 data 0x%x into hsync gap +%d - %d: ofs %d, eol@ +%d, x %d, y %d" SRCLINE, px, b, i, onoff, hstride32, vinfo.xres, bitofs - 1, y * (hstride32 - vinfo.xres), x, y); //shouldn't happen
//not needed; x/y calc above fixes it when bitofs wraps to next line:
//                    bitofs += hstride - vinfo.xres; //eol gap: compensate for hsync and/or scan line pad within framebuffer
//#endif
            }
        }
//printf("" SRCLINE);
//if (px > 5) break;
    }
    printf("" SRCLINE);
//        if (frnum < 10) system_printf("cat %s > frame-%d.dat", FBDEV, frnum++);
    wait4frame(20); //20 frames == 1 sec @20FPS
//break;
//        if (want_blank) break; //only need to blank 1x
//    }
}



//change framebuffer timing to match desired fps:
void setup()
{
//    pixclock / 1e9 * (vinfo.xres + vinfo.hblank()) * (vinfo.yres + vinfo.vblank()) * fps = 1 second;
    int target_ytotal = (int)1e9 / vinfo.pixclock * (int)1e3 / (vinfo.xres + vinfo.hblank()) / FPS;
    printf("ytotal is %d, needs to be %d for %d fps" SRCLINE, vinfo.yres + vinfo.vblank(), target_ytotal, FPS);
//return;
    if (target_ytotal == vinfo.yres + vinfo.vblank()) return;
    vinfo.lower_margin = vinfo.upper_margin = 3; vinfo.vsync_len = 4; //TODO: are these the best values?
    vinfo.xres = target_ytotal - vinfo.vblank();
    if (ioctl(fbfd, FBIOPUT_VSCREENINFO, &vinfo)) 
      printf("Error reading setting variable information." SRCLINE);
    struct my_var_screeninfo chk_vinfo;
    if (ioctl(fbfd, FBIOGET_VSCREENINFO, &chk_vinfo)) 
      printf("Error re-reading var information." SRCLINE);
    else if (chk_vinfo.yres != vinfo.yres || chk_vinfo.vblank() != vinfo.vblank())
        printf("failed to set yres: got %d + %d, wanted %d + %d" SRCLINE, chk_vinfo.yres, chk_vinfo.vblank(), vinfo.yres, vinfo.vblank());
    vinfo.pixclock = measure_pxclock(); //get updated value
}


#if 0
//change framebuffer timing to match optimal WS281X rendering:
void OBSOLETE_setup(int fbfd, struct fb_var_screeninfo* vinfo_p)
{
    struct fb_var_screeninfo vinfo = *vinfo_p;
    uint32_t xtotal = vinfo.xres + vinfo.right_margin + vinfo.hsync_len + vinfo.left_margin;
    uint32_t ytotal = vinfo.yres + vinfo.lower_margin + vinfo.vsync_len + vinfo.upper_margin;
    if (vinfo.xres == WANT_XRES && xtotal == WANT_XTOTAL && vinfo.yres == WANT_YRES && ytotal == WANT_YTOTAL) return;
//try dynamic screen res update instead of using config.txt:
//dpi_timings=392 0 0 1 0  294 0 4 3 4  0 0 0  20 0 2400000 1
    vinfo.xres = WANT_XRES; vinfo.left_margin = 0; vinfo.hsync_len = 1; vinfo.right_margin = 0;
    int third = (WANT_YTOTAL - WANT_YRES) / 3;
    vinfo.yres = WANT_YRES; vinfo.upper_margin = third; vinfo.vsync_len = WANT_YTOTAL - WANT_YRES - 2 * third; vinfo.lower_margin = third;
    vinfo.pixclock = (int)10e6 / 24L; //(int)1e9 / 2.4L; //2.4MHz needed for WS281X render @3x
    if (ioctl(fbfd, FBIOPUT_VSCREENINFO, &vinfo)) 
      printf("Error reading setting variable information." SRCLINE);

    struct fb_var_screeninfo chk_vinfo;
    if (ioctl(fbfd, FBIOGET_VSCREENINFO, &chk_vinfo)) 
      printf("Error re-reading var information." SRCLINE);
    chk_vinfo.pixclock = 0; //force re-measure
    if (!chk_vinfo.pixclock) chk_vinfo.pixclock = measure_pxclock(); //-1;
    int frtime_usec = (double)chk_vinfo.pixclock * (chk_vinfo.xres + chk_vinfo.left_margin + chk_vinfo.hsync_len + chk_vinfo.right_margin) / (int)1e3 * (chk_vinfo.yres + chk_vinfo.upper_margin + chk_vinfo.vsync_len + chk_vinfo.lower_margin ) / (int)1e3; //kludge: split 1e6 to avoid overflow
    float fps = 1e6 / frtime_usec;
    printf("updated %dx%d, %d bpp, linelen %d px, pxclk %d (%3.2f MHz), lrul marg %d %d %d %d, sync len h %d v %d, fps %3.2f" SRCLINE, 
       chk_vinfo.xres, chk_vinfo.yres, chk_vinfo.bits_per_pixel, finfo.line_length / 4, chk_vinfo.pixclock, 1e6 / chk_vinfo.pixclock,
       chk_vinfo.left_margin, chk_vinfo.right_margin, chk_vinfo.upper_margin, chk_vinfo.lower_margin, chk_vinfo.hsync_len, chk_vinfo.vsync_len,
       fps);

//timing is critical for WS281X pixels, verify it was updated correctly:
    if (chk_vinfo.xres != vinfo.xres || chk_vinfo.right_margin != vinfo.right_margin || chk_vinfo.hsync_len != vinfo.hsync_len || chk_vinfo.left_margin != vinfo.left_margin) printf("failed to really set h timing: %d %d %d %d vs %d %d %d %d" SRCLINE, chk_vinfo.xres, chk_vinfo.left_margin, chk_vinfo.hsync_len, chk_vinfo.right_margin, vinfo.xres, vinfo.left_margin, vinfo.hsync_len, vinfo.right_margin);
    if (chk_vinfo.yres != vinfo.yres || chk_vinfo.lower_margin != vinfo.lower_margin || chk_vinfo.vsync_len != vinfo.vsync_len || chk_vinfo.upper_margin != vinfo.upper_margin) printf("failed to really set v timing: %d %d %d %d vs %d %d %d %d" SRCLINE, chk_vinfo.yres, chk_vinfo.upper_margin, chk_vinfo.vsync_len, chk_vinfo.lower_margin, vinfo.yres, vinfo.upper_margin, vinfo.vsync_len, vinfo.lower_margin);
    if (chk_vinfo.pixclock != vinfo.pixclock) printf("failed to really set pixclock: %d vs %d" SRCLINE, chk_vinfo.pixclock, vinfo.pixclock);

    struct fb_fix_screeninfo chk_finfo;
    if (ioctl(fbfd, FBIOGET_FSCREENINFO, &chk_finfo)) 
      printf("Error re-reading fixed information." SRCLINE);
    if (chk_finfo.line_length != finfo.line_length || chk_finfo.smem_len != finfo.smem_len) printf("stride (fixed) changed: %d %d vs %d %d" SRCLINE, chk_finfo.line_length, chk_finfo.smem_len, finfo.line_length, finfo.smem_len);
    else printf("uh oh, fixed stride !change > var info update, is this ok?" SRCLINE);

    printf("after reconfig:" SRCLINE);
    system_printf("fbset -fb %s", FBDEV);
//    system("vcgencmd get_config str | grep timings");
    printf("\"ALT2\" shows DPI pins:" SRCLINE);
    system("gpio readall | grep -e 38 -e 40");
}
#endif


//parse+dump ws281x data:
void dump()
{
return; //broken
    int hstride = finfo.line_length / 4; //bytes -> uint32
    const uint32_t* bp = (const uint32_t*)fbp;
    for (int px = 0; px < NUMPX + 10; ++px)
    {
        for (int bit = 0; bit < 24; ++bit)
        {
            int bitofs = bp - (uint32_t*)fbp;
            int x = bitofs % vinfo.xres, y = bitofs / vinfo.xres; //NOTE: WS pixel might overflow to next scan line
            if (px && !bit && !x) bp += hstride - vinfo.xres;
            printf("0x%x ", *bp); continue;
            if (bp[0] == 0xFF000000 && bp[1] == 0xFF000000 && bp[2] == 0xff000000) printf("z");
            else if (bp[0] != (uint32_t)-1 || bp[2] != 0xff000000) printf("?");
            else printf("%s", (bp[1] == (uint32_t)-1)? "1": (bp[1] == 0xff000000)? "0": "X");
            ++bp;
        }
        printf(" ");
    }
    printf(SRCLINE);
}


// application entry point
int main(int argc, char* argv[])
{
//printf("TODO: try config_hdmi_boost?" SRCLINE);
//printf("TODO: try setting overscan* = 0 or disable_overscan=0?" SRCLINE);
printf("TODO: try setting fb depth to 8 and back 10 16?" SRCLINE);
//    struct fb_var_screeninfo orig_vinfo;
//    long int screensize = 0;
//    int fbfd = 0;

#if 0
//    for (int i = 4; i >= 0; --i)
    {
        int i = WHICHFB;
        snprintf(FBDEV, sizeof(FBDEV), "/dev/fb%d", i);
        printf("trying %s ..." SRCLINE, FBDEV);
        int fd = open(FBDEV, O_RDWR);
        if (fd >= 0) close(fd);
//        if (fd >= 0) break;
        if (fd < 0) { printf("no fb dev?" SRCLINE); return(1); }
    }
    printf("using %s" SRCLINE, FBDEV);
#endif
    snprintf(FBDEV, sizeof(FBDEV), "/dev/fb%d", WHICHFB);

//show video timing::
    printf("at start:" SRCLINE);
    system("fbset -fb /dev/fb0");
    system("fbset -fb /dev/fb1");
    system("vcgencmd get_config str | grep timings");
    system("tvservice -s");
    system("gpio readall | grep -e 38 -e 40");

    system_printf("cat %s > before.dat", FBDEV);

//TODO: how to check if kernel supports device tree?  (required by bcm lib)
//maybe just check for /proc/device-tree/soc/ranges in the file sys?
//TODO: check how raspi-config enables dev tree support
#ifdef WANT_BCM //need to set ALT2
    if (!bcm2835_init())
    {
      printf("Error: bcm init failed." SRCLINE);
      return(1);
    }
#define APIN  RPI_V2_GPIO_P1_38 //GPIO 20
#define BPIN  RPI_V2_GPIO_P1_40 //GPIO 21
    printf("bcm opened, ver %d, setting pins %d, %d to dpi" SRCLINE, bcm2835_version());
//set a couple of pins for DPI:
    int sv_gpio20, sv_gpio21; //TODO: how to get/save current mode?  maybe don't need to
    bcm2835_gpio_fsel(APIN, BCM2835_GPIO_FSEL_ALT2); //GPIO 20
    bcm2835_gpio_fsel(BPIN, BCM2835_GPIO_FSEL_ALT2); //GPIO 21
    bcm2835_close(); //dealloc any mem used; is this needed?
#endif

    // Open the file for reading and writing
    fbfd = open(FBDEV, O_RDWR);
    if (!fbfd || ((int)fbfd == -1))
    {
      printf("Error: cannot open framebuffer device '%s'." SRCLINE, FBDEV);
      return(1);
    }
    printf("using %s" SRCLINE, FBDEV);

    // Get fixed screen information
    if (ioctl(fbfd, FBIOGET_FSCREENINFO, &finfo)) 
      printf("Error reading fixed information." SRCLINE);

    // Get variable screen information
    if (ioctl(fbfd, FBIOGET_VSCREENINFO, &vinfo)) 
      printf("Error reading variable information." SRCLINE);
    if (!vinfo.pixclock) vinfo.pixclock = measure_pxclock(); //-1;

    int frtime_usec = (double)vinfo.pixclock * (vinfo.xres + vinfo.hblank()) / (int)1e3 * (vinfo.yres + vinfo.vblank()) / (int)1e3; //kludge: split 1e6 to avoid overflow
    float fps = 1e6 / frtime_usec;
    printf("%dx%d, %d bpp, linelen %d px, pxclk %d (%3.2f MHz), h/v blank %d %d, fps %3.2f" SRCLINE, 
       vinfo.xres, vinfo.yres, vinfo.bits_per_pixel, finfo.line_length / 4, vinfo.pixclock, vinfo.pixfreq(), vinfo.hblank(), vinfo.vblank(), fps);

// Store for reset (copy vinfo to vinfo_orig)
    struct fb_var_screeninfo orig_vinfo;
    memcpy(&orig_vinfo, &vinfo, sizeof(vinfo)); //struct fb_var_screeninfo));
    setup(); //fbfd, &vinfo);

// map fb to user mem 
    long int screensize = vinfo.xres * vinfo.yres * vinfo.bits_per_pixel / 8;
    fbp = (char*)mmap(0, screensize, PROT_READ | PROT_WRITE, MAP_SHARED, fbfd, 0);
	memset(fbp, 0, screensize); //only needs to be done 1x if full redraw each time
    if (fbp == (char*)-1) printf("Failed to mmap." SRCLINE);
    else
    {
        write(fbfd, CURSOFF, strlen(CURSOFF));
#ifndef EOL_BUG
        for (int loop = 0; loop <= 10; ++loop) //animation loop
            draw(loop);
#endif
        draw(1111);
        sleep(5);
        draw(-1); //blank
//    write(fbfd, CURSON, strlen(CURSOFF)); //leave it off?
        dump();
    // cleanup
        munmap(fbp, screensize);
    }

//don't restore screen (messes up last WS281X state):
//    if (ioctl(fbfd, FBIOPUT_VSCREENINFO, &orig_vinfo))
//        printf("Error re-setting variable information." SRCLINE);
    printf("NOT restoring fb geometry; manually reset with a command like:\n \"fbset -fb %s -xres %d -yres %d -pixclock %d\"" SRCLINE, FBDEV, orig_vinfo.xres, orig_vinfo.yres, orig_vinfo.pixclock);
    printf("NOT restoring GPIO modes; manually reset with a command like:\n \"gpio -g mode %d IN\" #put GPIO%d back to input mode" SRCLINE, 20, 20);

    close(fbfd);

//   bcm2835_close(); //dealloc any mem used; is this needed?
   system_printf("cat %s > after.dat", FBDEV);
   printf("done" SRCLINE);
   return 0; 
}

<<<<<<< HEAD
//eof
=======
//eof
>>>>>>> f99a4238755e41b728e6e1eea0ec1d6d98a4a47b
