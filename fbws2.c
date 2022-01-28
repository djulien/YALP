//WS281X test using Linux framebuffer:
//build:  gcc fbws.c bcm2835.c -o fbws
//run:  [sudo]  fbws

#include <unistd.h>
#include <stdio.h>
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

//#include "../fpp-djgit/src/util/bcm2835.h"
#include "../fpp-djgit/src/util/bcm2835.c"



// 'global' variables to store screen info
char* fbp = 0;
struct fb_var_screeninfo vinfo;
struct fb_fix_screeninfo finfo;

void put_pixel_RGB32(int x, int y, int r, int g, int b)
{
    // calculate the pixel's byte offset inside the buffer
    // note: x * 3 as every pixel is 3 consecutive bytes
    unsigned int pix_offset = x * 4 + y * finfo.line_length;

    // now this is about the same as 'fbp[pix_offset] = value'
    *((char*)(fbp + pix_offset)) = b;
    *((char*)(fbp + pix_offset + 1)) = g;
    *((char*)(fbp + pix_offset + 2)) = r;
    *((char*)(fbp + pix_offset + 3)) = 0xff;

}

void put_pixel_RGB24(int x, int y, int r, int g, int b)
{
    // calculate the pixel's byte offset inside the buffer
    // note: x * 3 as every pixel is 3 consecutive bytes
    unsigned int pix_offset = x * 3 + y * finfo.line_length;

    // now this is about the same as 'fbp[pix_offset] = value'
    *((char*)(fbp + pix_offset)) = b;
    *((char*)(fbp + pix_offset + 1)) = g;
    *((char*)(fbp + pix_offset + 2)) = r;

}

void put_pixel_RGB565(int x, int y, int r, int g, int b)
{
    // calculate the pixel's byte offset inside the buffer
    // note: x * 2 as every pixel is 2 consecutive bytes
    unsigned int pix_offset = x * 2 + y * finfo.line_length;

    // now this is about the same as 'fbp[pix_offset] = value'
    // but a bit more complicated for RGB565
    //unsigned short c = ((r / 8) << 11) + ((g / 4) << 5) + (b / 8);
    unsigned short c = ((r / 8) * 2048) + ((g / 4) * 32) + (b / 8);
    // write 'two bytes at once'
    *((unsigned short*)(fbp + pix_offset)) = c;

}

void put_pixel(int x, int y, int r, int g, int b)
{
	switch ( vinfo.bits_per_pixel)
	{
		case 16: put_pixel_RGB565(x, y, r, g, b); return;
        case 24: put_pixel_RGB24(x, y, r, g, b); return;
        case 32: put_pixel_RGB32(x, y, r, g, b); return;
    }
}


#define fatal(msg)  printf("%s\n", msg) //shim
#define UNITS  (int)1e6

uint32_t elapsed_usec()
{
    struct timeval time_parts;
    if (gettimeofday(&time_parts, NULL)) fatal("get time of day failed");
    uint32_t retval = time_parts.tv_sec * UNITS + time_parts.tv_usec / ((int)1e6 / UNITS); //could wrap but shouldn't matter if taking time diff
    return retval;
}


//wait for next frame:
//synced to GPU
void frame(int fbfd, int numfr) // = 0)
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
            printf("vsync failed, simulate with sleep\n");
            usleep((int)50e3); //emulate 20 fps; NOT ACCURATE
        }
//        loop_usec += elapsed_usec();
//        printf("... took %d usec\n", loop_usec);
    }
    taken_usec += elapsed_usec();
    printf("... took %d usec (%d usec/frame)\n", taken_usec, taken_usec / sv_numfr);
}


//measure pix clock:
//(ioctl doesn't give this info)
#define LIMIT  (int)2.5e6 //safe limit before signed wrap
#define rdiv(num, den)  (((num) + (den) / 2) / (den))
int measure_pxclock(int fbfd)
{
    struct fb_var_screeninfo vinfo;
    memset(&vinfo, 0, sizeof(vinfo));
    if (ioctl(fbfd, FBIOGET_VSCREENINFO, &vinfo))
      printf("Error reading var information.\n");
    uint32_t xtotal = vinfo.xres + vinfo.right_margin + vinfo.hsync_len + vinfo.left_margin;
    if (vinfo.xres == 392 && xtotal != 393) printf("xtotal %d wrong: %d %d %d %d\n", xtotal, vinfo.xres, vinfo.right_margin, vinfo.hsync_len, vinfo.left_margin);
    uint32_t ytotal = vinfo.yres + vinfo.lower_margin + vinfo.vsync_len + vinfo.upper_margin;
    if (vinfo.yres == 294 && ytotal != 305) printf("ytotal %d wrong: %d %d %d %d\n", ytotal, vinfo.yres, vinfo.upper_margin, vinfo.vsync_len, vinfo.lower_margin);
    frame(fbfd, 1); //skip current frame since it might be partial
    uint32_t taken_usec = -elapsed_usec();
#define NUMFR  40 //       CONSTDEF(NUMFR, 40); //CAUTION: elapsed time in usec must stay under ~ 2 sec to avoid overflow; 40 frames @60Hz ~= 667K, @30Hz ~= 1.3M, @20Hz == 2M usec
    frame(fbfd, NUMFR);
    taken_usec += elapsed_usec();
    printf("elapsed %d, #fr %d, xtotal %u, ytotal %u\n", taken_usec, NUMFR, xtotal, ytotal);
    if (taken_usec > LIMIT) printf("measure_clock: elapsed %d took too long: %'d usec limit %'d\n", NUMFR, taken_usec, LIMIT);
//    uint32_t pxclock = taken_usec / NUMFR;
    uint32_t pxclock = rdiv(rdiv(rdiv(taken_usec, NUMFR) * (int)1e3, xtotal) * (int)1e3, ytotal); //usec => psec; kludge: split up 1e6 factor to prevent overflow
    printf("px clock: %d psec (%3.2f fps)\n", pxclock, 1e9 / pxclock);
    return pxclock;
}
//should be: measured pix clock 416,669 psec = 1,997,752 usec / 40 frames / 393 xtotal / 305 ytotal, this@ 0x575f5a8 T+2.070 $0 @yalp-napi.cpp:432



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
#define BITW(b)  (((b) < 23)? 64: 48) //last bit is partially hidden
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

//#of GPU px to render each WS281X px:
#define PPB  3 //GPU @2.4MHz (bare minimum for WS281X formatting)
//#define PPB 64 //GPU @50 MHz

#define NUMPX  20 //37

void draw(int fbfd)
{
	uint32_t colors[] = {RGSWAP(RED), RGSWAP(GREEN), BLUE, YELLOW, RGSWAP(CYAN), RGSWAP(MAGENTA), WHITE};
	const char* color_names[] = {"R", "G", "B", "Y", "C", "M", "W"};
//for (int i = 0; i < nel(colors); ++i) printf("color[%d/%d]: 0x%x\n", i, nel(colors), colors[i]);
	long int scrsize = vinfo.xres * vinfo.yres * vinfo.bits_per_pixel / 8;
	memset(fbp, 0, scrsize);
    for (int loop = 0; loop <= 10; ++loop) //animation loop
    {
        printf("anim[%d/10]: ", loop);
        for (int y = 0; y < NUMPX; ++y) //WS281X pixel loop (1 per scan line)
        {
            uint32_t color = colors[(y + loop) % nel(colors)];
            printf("%s ", color_names[(y + loop) % nel(colors)]);
	        for (int b = 0; b < 24; ++b) //WS281X bit loop; NOTE: last bit is partially hidden by hsync; check for precise alignment
	        {
		        if (loop == 10) color = 0;
//if (!b) printf("node[%d]: 0x%x\n", y, color);
		        uint32_t bv = color & (0x800000 >> b);
		        for (int i = 0; i < BITW(b); ++i)
		        {
			        int onoff = (i < _H(bv))? 0xff: 0;
			        put_pixel(BITW(0) * b + i, y, onoff, onoff, onoff);
		        }
	        }
        }
        printf("\n");
        frame(fbfd, 20); //20 frames == 1 sec @20FPS
    }
}


//set all WS281X px to 0 (off):
void blank(int fbfd)
{
	long int scrsize = vinfo.xres * vinfo.yres * vinfo.bits_per_pixel / 8;
	memset(fbp, 0, scrsize);
    for (int y = 0; y < NUMPX + 50; ++y) //WS281X pixel loop (1 per scan line); blank out extra in case junk was sent
    {
        for (int b = 0; b < 24; ++b) //WS281X bit loop; NOTE: last bit is partially hidden by hsync; check for precise alignment
        {
	        for (int i = 0; i < BITW(b); ++i)
	        {
                int bv = 0; //all bits off
		        int onoff = (i < _H(bv))? 0xff: 0;
		        put_pixel(BITW(0) * b + i, y, onoff, onoff, onoff);
	        }
        }
    }
    frame(fbfd, 20); //20 frames == 1 sec @20FPS
}


// helper function for drawing - no more need to go mess with
// the main function when just want to change what to draw...
#define sqrt(x)  0
void old_draw() {

    int x, y;
    int r, g, b;
    int dr;
    int cr = vinfo.yres / 3;
    int cg = vinfo.yres / 3 + vinfo.yres / 4;
    int cb = vinfo.yres / 3 + vinfo.yres / 4 + vinfo.yres / 4;

    for (y = 0; y < (vinfo.yres); y++) {
        for (x = 0; x < vinfo.xres; x++) {
            dr = (int)sqrt((cr - x)*(cr - x)+(cr - y)*(cr - y));
            r = 255 - 256 * dr / cr;
            r = (r >= 0) ? r : 0;
            dr = (int)sqrt((cg - x)*(cg - x)+(cr - y)*(cr - y));
            g = 255 - 256 * dr / cr;
            g = (g >= 0) ? g : 0;
            dr = (int)sqrt((cb - x)*(cb - x)+(cr - y)*(cr - y));
            b = 255 - 256 * dr / cr;
            b = (b >= 0) ? b : 0;

                put_pixel(x, y, r, g, b);
        }
    }
sleep(1);
}


void setup(int fbfd, struct fb_var_screeninfo* vinfo_p)
{
    struct fb_var_screeninfo vinfo = *vinfo_p;
    if (vinfo.xres == 392 && vinfo.yres == 294) return;
//try dynamic screen res update instead of using config.txt:
//dpi_timings=392 0 0 1 0  294 0 4 3 4  0 0 0  20 0 2400000 1
    vinfo.xres = 392; vinfo.left_margin = 0; vinfo.hsync_len = 1; vinfo.right_margin = 0;
    vinfo.yres = 294; vinfo.upper_margin = 4; vinfo.vsync_len = 3; vinfo.lower_margin = 4;
    vinfo.pixclock = (int)10e6 / 24L; //(int)1e9 / 2.4L; //2.4MHz needed for WS281X render @3x
    if (ioctl(fbfd, FBIOPUT_VSCREENINFO, &vinfo)) 
      printf("Error reading setting variable information.\n");

    struct fb_var_screeninfo chk_vinfo;
    if (ioctl(fbfd, FBIOGET_VSCREENINFO, &chk_vinfo)) 
      printf("Error re-reading var information.\n");
    chk_vinfo.pixclock = 0; //force re-measure
    if (!chk_vinfo.pixclock) chk_vinfo.pixclock = measure_pxclock(fbfd); //-1;
    int frtime_usec = (double)chk_vinfo.pixclock * (chk_vinfo.xres + chk_vinfo.left_margin + chk_vinfo.hsync_len + chk_vinfo.right_margin) / (int)1e3 * (chk_vinfo.yres + chk_vinfo.upper_margin + chk_vinfo.vsync_len + chk_vinfo.lower_margin ) / (int)1e3; //kludge: split 1e6 to avoid overflow
    float fps = 1e6 / frtime_usec;
    printf("updated %dx%d, %d bpp, linelen %d, pxclk %d (%3.2f MHz), lrul marg %d %d %d %d, sync len h %d v %d, fps %3.2f\n", 
       chk_vinfo.xres, chk_vinfo.yres, chk_vinfo.bits_per_pixel, finfo.line_length, chk_vinfo.pixclock, 1e6 / chk_vinfo.pixclock,
       chk_vinfo.left_margin, chk_vinfo.right_margin, chk_vinfo.upper_margin, chk_vinfo.lower_margin, chk_vinfo.hsync_len, chk_vinfo.vsync_len,
       fps);

//timing is critical for WS281X pixels, verify it was updated correctly:
    if (chk_vinfo.xres != vinfo.xres || chk_vinfo.right_margin != vinfo.right_margin || chk_vinfo.hsync_len != vinfo.hsync_len || chk_vinfo.left_margin != vinfo.left_margin) printf("failed to really set h timing: %d %d %d %d vs %d %d %d %d\n", chk_vinfo.xres, chk_vinfo.left_margin, chk_vinfo.hsync_len, chk_vinfo.right_margin, vinfo.xres, vinfo.left_margin, vinfo.hsync_len, vinfo.right_margin);
    if (chk_vinfo.yres != vinfo.yres || chk_vinfo.lower_margin != vinfo.lower_margin || chk_vinfo.vsync_len != vinfo.vsync_len || chk_vinfo.upper_margin != vinfo.upper_margin) printf("failed to really set v timing: %d %d %d %d vs %d %d %d %d\n", chk_vinfo.yres, chk_vinfo.upper_margin, chk_vinfo.vsync_len, chk_vinfo.lower_margin, vinfo.yres, vinfo.upper_margin, vinfo.vsync_len, vinfo.lower_margin);
    if (chk_vinfo.pixclock != vinfo.pixclock) printf("failed to really set pixclock: %d vs %d\n", chk_vinfo.pixclock, vinfo.pixclock);

    struct fb_fix_screeninfo chk_finfo;
    if (ioctl(fbfd, FBIOGET_FSCREENINFO, &chk_finfo)) 
      printf("Error re-reading fixed information.\n");
    if (chk_finfo.line_length != finfo.line_length || chk_finfo.smem_len != finfo.smem_len) printf("stride (fixed) changed: %d %d vs %d %d\n", chk_finfo.line_length, chk_finfo.smem_len, finfo.line_length, finfo.smem_len);
    else printf("uh oh, fixed stride !change > var info update, is this ok?\n");

    printf("after reconfig:\n");
    system("fbset");
//    system("vcgencmd get_config str | grep timings");
    system("gpio readall | grep -e 38 -e 40");
}


// application entry point
int main(int argc, char* argv[])
{
    struct fb_var_screeninfo orig_vinfo;
    long int screensize = 0;
    int fbfd = 0;

//show video timing::
    printf("at start:\n");
    system("fbset");
    system("vcgencmd get_config str | grep timings");
    system("tvservice -s");
    system("gpio readall | grep -e 38 -e 40");

    system("cat /dev/fb0 > before.dat");

//TODO: how to check if kernel supports device tree?  (required by bcm lib)
//maybe just check for /proc/device-tree/soc/ranges in the file sys?
//TODO: check how raspi-config enables dev tree support
    if (!bcm2835_init())
    {
      printf("Error: bcm init failed.\n");
      return(1);
    }
    printf("bcm opened, ver %d\n", bcm2835_version());
//set a couple of pins for DPI:
    int sv_gpio20, sv_gpio21; //TODO: how to get/save current mode?  maybe don't need to
    bcm2835_gpio_fsel(RPI_V2_GPIO_P1_38, BCM2835_GPIO_FSEL_ALT2); //GPIO 20
    bcm2835_gpio_fsel(RPI_V2_GPIO_P1_40, BCM2835_GPIO_FSEL_ALT2); //GPIO 21
    bcm2835_close(); //dealloc any mem used; is this needed?

    // Open the file for reading and writing
    fbfd = open("/dev/fb0", O_RDWR);
    if (!fbfd || ((int)fbfd == -1))
    {
      printf("Error: cannot open framebuffer device.\n");
      return(1);
    }
    printf("The framebuffer device was opened successfully.\n");

    // Get fixed screen information
    if (ioctl(fbfd, FBIOGET_FSCREENINFO, &finfo)) 
      printf("Error reading fixed information.\n");

    // Get variable screen information
    if (ioctl(fbfd, FBIOGET_VSCREENINFO, &vinfo)) 
      printf("Error reading variable information.\n");
    if (!vinfo.pixclock) vinfo.pixclock = measure_pxclock(fbfd); //-1;
    int frtime_usec = (double)vinfo.pixclock * (vinfo.xres + vinfo.left_margin + vinfo.hsync_len + vinfo.right_margin) / (int)1e3 * (vinfo.yres + vinfo.upper_margin + vinfo.vsync_len + vinfo.lower_margin ) / (int)1e3; //kludge: split 1e6 to avoid overflow
    float fps = 1e6 / frtime_usec;
    printf("Original %dx%d, %d bpp, linelen %d, pxclk %d (%3.2f MHz), lrul marg %d %d %d %d, sync len h %d v %d, fps %3.2f\n", 
       vinfo.xres, vinfo.yres, vinfo.bits_per_pixel, finfo.line_length, vinfo.pixclock, 1e6 / vinfo.pixclock,
       vinfo.left_margin, vinfo.right_margin, vinfo.upper_margin, vinfo.lower_margin, vinfo.hsync_len, vinfo.vsync_len,
       fps);

    // Store for reset (copy vinfo to vinfo_orig)
    memcpy(&orig_vinfo, &vinfo, sizeof(vinfo)); //struct fb_var_screeninfo));

    setup(fbfd, &vinfo);

    // map fb to user mem 
    screensize = vinfo.xres * vinfo.yres * vinfo.bits_per_pixel / 8;
    fbp = (char*)mmap(0, screensize, PROT_READ | PROT_WRITE, MAP_SHARED, fbfd, 0);
    write(fbfd, CURSOFF, strlen(CURSOFF));
    if (!fbfd || (fbp == (char*)-1))
        printf("Failed to mmap.\n");
    else {
        // draw...
        draw(fbfd);
        sleep(5);
    }
//    write(fbfd, CURSON, strlen(CURSOFF)); //leave it off?

    blank(fbfd);
    // cleanup
    munmap(fbp, screensize);
//don't restore screen (messes up last WS281X state):
//    if (ioctl(fbfd, FBIOPUT_VSCREENINFO, &orig_vinfo))
//        printf("Error re-setting variable information.\n");
    printf("NOT restoring fb geometry; manually reset with a command like \"fbset -xres %d -yres %d -pixclock %d\"\n", orig_vinfo.xres, orig_vinfo.yres, orig_vinfo.pixclock);

    close(fbfd);

//   bcm2835_close(); //dealloc any mem used; is this needed?
   system("cat /dev/fb0 > after.dat");
   printf("done\n");
   return 0; 
}
