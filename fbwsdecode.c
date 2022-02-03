//decode WS281X data in Linux framebuffer:

//to build:  gcc fbws.c -o fbws

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


#define WHICHFB  0
//#define FBDEV  "/dev/fb0"
//#define FBDEV  "/dev/fb1"


//convert to string + force inner macro expansion:
#define TOSTR(str)  TOSTR_NESTED(str)
#define TOSTR_NESTED(str)  #str //kludge: need nested level to force expansion

#define SRCLINE  " @" TOSTR(__LINE__) "\n"


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

int main()
{
    char FBDEV[16];
    snprintf(FBDEV, sizeof(FBDEV), "/dev/fb%d", WHICHFB);
    system_printf("fbset -fb %s", FBDEV);

    int fbfd = open(FBDEV, O_RDWR);
    if (!fbfd || ((int)fbfd == -1))
    {
      printf("Error: cannot open framebuffer device." SRCLINE);
      return(1);
    }
    printf("using %s" SRCLINE, FBDEV);

    struct fb_fix_screeninfo finfo;
    if (ioctl(fbfd, FBIOGET_FSCREENINFO, &finfo)) 
      printf("Error reading fixed information." SRCLINE);

    struct fb_var_screeninfo vinfo;
    if (ioctl(fbfd, FBIOPUT_VSCREENINFO, &vinfo)) 
      printf("Error reading setting variable information." SRCLINE);

    int screensize = vinfo.xres * vinfo.yres * vinfo.bits_per_pixel / 8;
    const uint32_t* fbp = (char*)mmap(0, screensize, PROT_READ | PROT_WRITE, MAP_SHARED, fbfd, 0);

    char wspixels[25 * 1800];
    char* wsbit = wspixels;
    int wspad = 0;
    int hstride32 = finfo.line_length / 4; //bytes -> uint32
//    for (int i = 0; i < screensize / 4; ++i)
    for (const uint32_t* bp = fbp; bp < fbp + screensize / 4; ++bp)
    {
        int x = (bp - fbp) % hstride32, y = (bp - fbp) / hstride32;
        if (x >= vinfo.xres) continue; //{ bp += hstride32 - vinfo.xres - 1; continue; }
        if (wsbit == wspixels)
        {
            if (*bp == 0xFF000000) continue; //skip blank header
            if (bp != fbp) wspad = bp - fbp; //wsbits += sprintf(wsbits. "(%d pad) ", bp - fbp);
        }
        if (x == vinfo.xres - 2) //ws bit spans gap
        {
            if (*bp++ != 0xFFFFFFFF) { *wsbit++ = '?'; continue; }
            if (*bp == 0xFF000000) *wsbit++ = '0';
            else if (*bp == 0xFFFFFFFF) *wsbit++ = '1';
            else *wsbit++ = '?';
            continue;
        }
        if (x == vinfo.xres - 1) { *wsbit++ = '?'; continue; } //misaligned
        if (*bp++ != 0xFFFFFFFF) { *wsbit++ = '?'; continue; }
        if (*bp == 0xFF000000) *wsbit++ = '0';
        else if (*bp == 0xFFFFFFFF) *wsbit++ = '1';
        else *wsbit++ = '?';
        if (*++bp != 0xFF000000) { *wsbit++ = '?'; continue; }
    }
    *wsbit = '\0';
    for (char* bp = wspixels; *bp;;)
    {


    munmap(fbp, screensize);
    close(fbfd);
   printf("done" SRCLINE);
   return 0; 
}


#define TRUE  1
#define FALSE  0


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
