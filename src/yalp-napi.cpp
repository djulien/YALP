///////////////////////////////////////////////////////////////////////////////
////
/// yalp-napi.cpp - YALP Node.js add-on; uses GPU as a 24-bit parallel port
// primary purpose: drive 24 channels of WS281X pixels using Node.js on a RPi, with low CPU overhead

// Rev history:
// 4.11.20  DJ  misc tweaks for single-threaded version
// 4.1.21  DJ  rewrite to use shm and support multiple procs or threads; reuse frbufs in shm with circ queue
// 4.2.21  DJ  move nodes out of port sttr, misc tweaks for RPi vs. XWindows
// 11.16.21  DJ  extract pivot + related into simpler addon

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
// c++filt <mangled-name> to show de-mangled name
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


#include <stdint.h> //uint32_t, etc.
#include "macro-vargs.h" //UPTO_#ARGS()


//#if __cplusplus < 201400L
// #pragma message("CAUTION: this file probably needs c++14 or later to compile correctly")
//#endif
//#if __cplusplus < 201703L
// #define expand(ver)  #ver
// extern const char* show_error = expand(__cplusplus);
// #error "sorry, need C++17 or later to compile" __cplusplus
////#else
//// #pragma message("okay, using C++ " TOSTR(__cplusplus))
//#endif


#ifndef _HOIST //#ifdef NEW_YALP //streamlined API
#pragma message(CYAN_MSG "using new (streamlined) YALP API" ENDCOLOR_NOLINE)

 #define HOIST_UTILS  1
 #define HOIST_HELPERS  2
 #define HOIST_DATASTTR  3
#define _HOIST  HOIST_HELPERS //HOIST_UTILS
#include __FILE__  //error here requires CD into folder or add "-I." to compile
#undef _HOIST

//#ifdef NODE_GYP_MODULE_NAME //defined by node-gyp
 #include "napi-helpers.h"
//#else //stand-alone compile; no Javascript
// #define NAPI_START_EXPORTS(...)  //noop
// #define NAPI_EXPORT_PROPERTY(...)  //noop
// #define NAPI_EXPORT_WRAPPED_PROPERTY(...)  //noop
// #define NAPI_EXPORT_METHOD(...)  //noop
// #define NAPI_STOP_EXPORTS(...)  //noop
// #define NAPI_EXPORT_CLASS(...)  //noop
// #define NAPI_EXPORT_OBJECT(...)  //noop
// #define NAPI_EXPORT_MODULES(...)  //noop
//#endif //def NODE_GYP_MODULE_NAME


//execute a shell command:
//results returned to caller as string (with newlines)
//from https://stackoverflow.com/questions/478898/how-do-i-execute-a-command-and-get-the-output-of-the-command-within-c-using-po
//#include <cstdio>
//#include <iostream>
#if 0
#include <stdio.h> //FILE, fgets(), popen(), pclose()
#include <unistd.h> //pipe()
#include <memory> //std::unique_ptr<>
//#include <stdexcept>
#include <string> //std::string
//#include <array>
std::string shell(const char* cmd)
{
//    std::array<char, 128> buffer;
    std::string result;
//debug("run shell command '%s' ...", cmd);
    std::unique_ptr<FILE, decltype(&pclose)> pipe(popen(cmd, "r"), pclose);
    if (!pipe) fatal("can't create pipe"); //throw std::runtime_error("popen() failed!");
    char buffer[250];
    while (fgets(buffer, sizeof(buffer), pipe.get()) != nullptr) result += buffer;
    std::string& result_esc = str_replace(result.c_str(), "\n", CYAN_MSG "\\n" ENDCOLOR_NOLINE); //esc special chars in debug output
debug("shell '%s' output %'lu:'%s'", cmd, result.length(), result_esc.c_str());
    return result;
}
#endif //0


#if 0
//file wrapper:
//auto-closes file upon scope exit
#include <unistd.h> //close(), getpid(), usleep()
//#include <stdio.h> //open(), close()
#include <fcntl.h> //open(), O_RDONLY, O_RDWR
//#include <sys/stat.h> //open()?
//#include <sys/types.h> //open()?
#include <utility> //std::forward<>()
//#include <stdexcept> //std::runtime_error()
//#include <string.h> //strerror()
//#include <errno.h> //errno
int open(int fd = -1) { return fd; } //kludge: can't overload templated member function in AutoFile, so overload open() instead
class AutoFile
{
protected: //allow children to see
    int m_fd;
public: //ctor/dtor
//    AutoClose(const char* name): AutoClose(
//    AutoFile(int fbnum): AutoClose(fbname(fbnum), O_RDWR) {}
    template <typename ... ARGS>
    AutoFile(ARGS&& ... args): m_fd(::open(std::forward<ARGS>(args) ...)) {} //debug("autofile: fd %d", m_fd); }; //perfect fwd args to open()
//can't specialize member functions :(    template<int> AutoFile(int fd): m_fd(fd) {};
//    template<> AutoFile(): m_fd(-1) {}
    ~AutoFile()
    {
        if (isOpen() && ::close(m_fd) < 0) fatal("file close failed"); //std::runtime_error(strerror(errno));
        m_fd = -1;
    }
public: //operators
    operator int() const { return m_fd; }
public: //methods
    inline bool isOpen() const { return !(m_fd < 0); } //::isOpen(m_fd); }
};
#endif //0


//FB wrapper:
//auto-closes FB upon scope exit
//optional (default) mmap/munmap
//2 scenarios:
//- if XWindows is running, emulate FB using SDL window
//- if running in console, use FB/stdio
#include <fcntl.h> //O_RDWR
//#include <sys/stat.h> //open()?
//#include <sys/types.h> //open()?
//#include <utility> //std::forward<>()
#include <unistd.h> //close(), getpid(), usleep()
#include <sys/ioctl.h> //ioctl()
#include <sys/mman.h> //mmap(), munmap(), PROT_*, MAP_*
#include <linux/fb.h> //FBIO_*, struct fb_var_screeninfo, fb_fix_screeninfo
//#include <ostream> //write()
//#include <mutex>
#include <map> //std::map<>
#include <tuple>
//#include <condition_variable>
#include <string> //std::string
template <typename PIXEL_T = uint32_t> //GPU pixel type (ARGB is 4 bytes)
#define AutoFB newer_AutoFB
class AutoFB: public AutoFile
{
    using SUPER = AutoFile;
//cursor control:
//turn cursor off when using framebuffer (interferes with pixels in that area)
//https://en.wikipedia.org/wiki/ANSI_escape_code#Escape_sequences
    static constexpr char* CURSOFF = "\x1B[?25l";
    static constexpr char* CURSON = "\x1B[?25h";
//    std::mutex m_mutex;
//protected: //allow children to see
public: //allow children to see
    /*volatile*/ PIXEL_T* m_pxbuf = (PIXEL_T*)MAP_FAILED;
    size_t m_stride32 = 0; //, m_height = 0;
    int m_fbnum, m_xres, m_xblank, m_yres, m_yblank; //, m_linelen; //, m_ppb;
    inline int xtotal() const { return m_xres + m_xblank; }
    inline int ytotal() const { return m_yres + m_yblank; }
    inline int pxbuf_len32() const { return m_stride32 * m_yres; } //#px in frbuf mem, *not* actual #px
    int m_pixclock; //, m_frtime_usec, m_vblank_usec, m_fps;
//not needed: public: //kludge: below needs to be public for NULL_OF kludge in child class getter
    inline int frtime_usec() const { int retval = rdiv(rdiv(m_pixclock * xtotal(), 1e3) * ytotal(), 1e3); return retval; } //debug("frtime_usec: pxclk %'d * xtotal %'d / 1e3 * ytotal %'d / 1e3 = %'d", m_pixclock, xtotal(), ytotal(), retval); return retval; } //psec -> usec; kludge: split up 1e6 factor to prevent overflow
    inline int vblank_usec() const { int retval = rdiv(rdiv(m_pixclock * xtotal(), 1e3) * m_yblank, 1e3); return retval; } //debug("vblank_usec: pxclk %'d * xtotal %'d / 1e3 * yblank %'d / 1e3 = %'d", m_pixclock, xtotal(), m_yblank, retval); return retval; } //psec -> usec; kludge: split up 1e6 factor to prevent overflow
    inline int fps() const { int retval = m_pixclock? rdiv((int)1e6, frtime_usec()): 0; return retval; } //debug("fps: 1e6 / frtime_usec %'d = %'d", frtime_usec(), retval); return retval; }
    int m_depth;
    std::string m_order; //char m_order[5];
//    bool m_dirty = false;
//    DevWindow* m_devwnd = 0;
public: //types
    using pixel_t = PIXEL_T;
    struct my_var_screeninfo: /*struct*/ fb_var_screeninfo
    {
//            int fbnum; //tag screen info with FB device#
//add helpers:
        inline int xtotal() const { return left_margin + xres + right_margin + hsync_len; }
        inline int ytotal() const { return upper_margin + yres + lower_margin + vsync_len; }
        inline int pixfreq() const { return pixclock? rdiv((int)1e9, pixclock): 0; } //psec => KHz
        inline bool has_pixclock() const { return (pixfreq() >= (int)1e3) && (pixfreq() <= (int)80e3); } //clock freq within expected range
//            inline int frtime_usec() const { return (int)(double)pixclock * xtotal() / (int)1e3 * ytotal() / (int)1e3; } //psec -> usec; kludge: split up 1e6 factor to prevent overflow
//            inline float fps() const { return (int)1e6 / frtime_usec(); }
    };
//    struct timing_t
//    {
//        int xres, xtotal, yres, ytotal, pxclock; //main timing params
//        bool for_timing, for_update; //want_mmap;
//        timing_t(): timing_t(0, 0, 0, 0, 0, false, false) {}
//        timing_t(int xr, int xt, int yr, int yt, int px, bool wt, bool mm): xres(xr), xtotal(xt), yres(yr), ytotal(yt), pxclock(px), for_timing(wt), for_update(mm) {};
//    };
//    static timing_t& NO_MMAP() { static timing_t m_timing; return m_timing; }
public: //ctor/dtor
//    template <typename ... ARGS>
//    AutoFB(ARGS&& ... args): SUPER(std::forward<ARGS>(args) ...), m_pxbuf(MAP_FAILED), m_stride32(0), m_height(0) //perfect fwd args to open()
//    AutoFB(int fbnum): AutoFB(fbnum, NO_MMAP()) {}
//    AutoFB(int fbnum, /*bool want_mmap = true,*/ const timing_t& gpuinfo): SUPER(fbname(fbnum), O_RDWR), m_fbnum(fbnum) //, m_pxbuf(MAP_FAILED), m_stride32(0), m_height(0)
    AutoFB(int fbnum, bool want_mmap = true): SUPER(fbname(fbnum), want_mmap? O_RDWR: O_RDONLY), m_fbnum(fbnum) //, m_pxbuf(MAP_FAILED), m_stride32(0), m_height(0)
    {
//        const bool want_mmap = gpuinfo.for_update; //want_mmap; //(&gpuinfo != &NO_MMAP());
//        const bool timovr = gpuinfo.xtotal && gpuinfo.yres; //broken-timovr = &gpuinfo != &(const timing_t&)NO_MMAP;
//debug("autoFB: fb# %d, mmap? %d, open? %d, ovr? %d: xtotal %d, yres %d", fbnum, want_mmap, isOpen(), timovr, gpuinfo.xtotal, gpuinfo.yres);
        if (!isOpen()) RETURN(want_mmap? fatal("open fb '%s' failed", fbname(fbnum)): 0);
        struct my_var_screeninfo scrv;
        if (::ioctl(*this, FBIOGET_VSCREENINFO, &scrv) < 0) fatal("can't get screen var info");
//        scrv.fbnum = fbnum; //tag with device#
        detailed_timing(scrv);
        measure_clock(scrv);
        m_xres = scrv.xres;
        m_xblank = scrv.xtotal() - scrv.xres; //scrv.right_margin + scrv.hsync_len + scrv.left_margin;
        m_yres = scrv.yres;
        m_yblank = scrv.ytotal() - scrv.yres; //scrv.lower_margin + scrv.vsync_len + scrv.upper_margin;
        m_pixclock = scrv.pixclock; //psec
//        m_frtime_usec = m_pixclock * xtotal() / 1e3 * ytotal() / 1e3; //psec -> usec; kludge: split up 1e6 factor to prevent overflow
//        m_vblank_usec = m_pixclock * xtotal() / 1e3 * m_yblank / 1e3; //psec -> usec; kludge: split up 1e6 factor to prevent overflow
//        m_fps = m_frtime_usec? (int)1e6 / m_frtime_usec: 0;
        m_depth = scrv.bits_per_pixel;
        char order[5]; //offsets are from right (<< rop)
        order[4 - (scrv.red.offset / 8) % 4 - 1] = 'R';
        order[4 - (scrv.green.offset / 8) % 4 - 1] = 'G';
        order[4 - (scrv.blue.offset / 8) % 4 - 1] = 'B';
        order[4 - (scrv.transp.offset / 8) % 4 - 1] = 'A';
        order[4] = '\0';
        m_order = order;
        struct fb_fix_screeninfo scrf;
        if (/*!timovr &&*/ ::ioctl(*this, FBIOGET_FSCREENINFO, &scrf) < 0) fatal("get screen fixed info failed");
//        if (timovr) //override timing with caller info
//        {
//            int xcmp = INTCMP(gpuinfo.xtotal, scrf.line_length / sizeof(DATA_T));
//            int ycmp = INTCMP(gpuinfo.yres, scrf.smem_len / scrf.line_length);
//            const char* cmpstr = "<=>";
//            if (xcmp || ycmp) warn("FB# %d override: xtotal %'lu %c actual %'lu, yres %'lu %c actual %'lu", fbnum, gpuinfo.xtotal, cmpstr[xcmp + 1], scrf.line_length / sizeof(DATA_T), gpuinfo.yres, cmpstr[ycmp + 1], scrf.smem_len / scrf.line_length);
//            if (isXWindows) scrf.line_length = gpuinfo.xtotal * sizeof(DATA_T); //NOTE: can't do this on real FB (rows would be misaligned in memory)
//            if (isXWindows || (ycmp < 0)) scrf.smem_len = gpuinfo.yres * scrf.line_length; //can only shorten real FB
//        }
        if (scrf.line_length % sizeof(PIXEL_T)) fatal("FB# %d row len %'d !multiple of px data type %d; row+gap addressing broken", fbnum, scrf.line_length, sizeof(PIXEL_T));
        m_stride32 = scrf.line_length / sizeof(PIXEL_T); //NOTE: might be larger than screen xres due to padding
//debug("rowlen %d", m_stride32);
//        if (scrf.smem_len % scrf.line_length) warn("FB# %d memlen %'d !multiple of row len %'d", fbnum, scrf.smem_len, scrf.line_length);
//        m_height = scrf.smem_len / scrf.line_length; //m_stride32;
        if (scrf.smem_len != scrf.line_length * scrv.yres) warn("FB# %d memlen %'d != row len %'d x yres %'d", fbnum, scrf.smem_len, scrf.line_length, scrv.yres);
//debug("height %d", m_height);
//        if (!want_mmap) return;
debug("using stride32 %'d, yres %'d, pxbuf32 %'d", m_stride32, m_yres, pxbuf_len32()); //, XWin? %d, isXWindows);
//        if (!gpuinfo.for_timing && !gpuinfo.for_update) return;
        if (!want_mmap) return;
//        if (isXWindows) RETURN(devwindow(gpuinfo));
        constexpr void* DONT_CARE = NULL; //CONSTDEF(DONT_CARE, NULL); //system chooses addr
//debug("addr %p, #px %'lu x len %'lu = size %'lu, prot 0x%x, flags 0x%x, fd %d, ofs 0", DONT_CARE, numpx(), sizeof(DATA_T), numpx() * sizeof(DATA_T), PROT_READ | PROT_WRITE, MAP_SHARED, (int)*this);
//notes about mmap RPi FB: https://forums.raspberrypi.com/viewtopic.php?t=263873
        m_pxbuf = (PIXEL_T*)::mmap(DONT_CARE, pxbuf_len32() * sizeof(PIXEL_T), PROT_READ | PROT_WRITE, MAP_SHARED, (int)*this, 0 /*ofs*/); //shared with GPU
        if (m_pxbuf == (PIXEL_T*)MAP_FAILED) fatal("mmap fb failed"); //throw std::runtime_error(strerror(errno));
//        if (m_stride32 != scrv.xres) warn("raster stride32 %'lu != width %'d", m_stride32, scrv.xres);
//        if (new_height * new_stride32 * 4 != scrf.smem_len) debug(YELLOW_MSG "CAUTION: raster size %'lu != calc %'d", new_height * new_stride32 * 4, scrf.smem_len);
#pragma message(TODO(madvise(fbp, finfo.smem_len, MADV_WILLNEED); "msync()" with "MS_SYNC" flag?))
        ::write(*this, CURSOFF, strlen(CURSOFF));
//        ::memset(m_pxbuf, 0, pxbuf_len32() * sizeof(DATA_T));
    }
    ~AutoFB()
    {
//        if (isXWindows) RETURN(devwindow());
        if (/*isOpen()*/ m_pxbuf == (PIXEL_T*)MAP_FAILED) return;
        ::write(*this, CURSON, strlen(CURSON));
        if (::munmap(m_pxbuf, pxbuf_len32() * sizeof(PIXEL_T)) < 0) fatal("munmap fb failed");
        m_pxbuf = (PIXEL_T*)MAP_FAILED;
    }
public: //methods
    static const char* fbname(int fbnum) { return strprintf("/dev/fb%d", fbnum); } //FB device name
    /*static*/ int wait4sync(/*int fd,*/ timer_t<(int)1e6>::elapsed_t fallback_usec = 0) //CAUTION: blocks caller's thread
    {
//        std::lock_guard<decltype(m_mutex)> lock(m_mutex); //don't allow >1 thread to sync simultaneously (should only happen during thread startup)
//        m_dirty = false; //tell caller update was flushed
//        if (isXWindows) return m_devwnd->wait4sync(); //NOTE: m_devwnd could be null
        int retval; // = true;
        int arg = 0; //must be 0
        if (retval = ioctl(*this, FBIO_WAITFORVSYNC, &arg) < 0)
        {
//TODO? adaptive vsync, OMAPFB_WAITFORVSYNC_FRAME
//    inline int getline()
//    {
//        int counter;
//        return (isOpen() && ioctl(m_fd, OMAPFB_GET_LINE_STATUS, &counter))? counter: -1;
//    }
//        static unsigned int arg = 0;
//        ioctl(fbdev, FBIO_WAITFORVSYNC, &arg);
//        if (!fallback_usec) fallback_usec = 10e3; //wait >= 1 msec so CPU doesn't get too busy
            if (!fallback_usec) fatal("wait4vsync failed (no fallback)");
            usleep(fallback_usec); //kludge: try to maintain timing
//            retval = false;
        }
//wrong        m_dirty = false; //benign (caller must write to FB shm); here just = status that caller can check
        return retval;
    }
//public: //helpers
//    class PxRow
//    {
//    public: //operators
//        inline DATA_T& operator[](size_t inx) const
//        {
//            return ((DATA_T*)this)[inx];
//        }
//    };
//public: //operators
//    operator DATA_T*() const { return m_pxbuf; }
//    inline const PxRow& operator[](size_t inx) const
//    {
//        return *(const PxRow*)&m_pxbuf[inx * m_stride32]; //kludge: cast a memberless row proxy on top of px buf at requested row address
//    }
public: //properties
//    inline bool dirty() const { return m_dirty; }
//    /*inline*/ void dirty(bool newval)
//    {
//        m_dirty = newval;
//        if (isXWindows) return m_devwnd->dirty(newval); //NOTE: m_devwnd could be null
//    }
//    DATA_T* pixels() const { return m_pxbuf; }
//    inline int fbnum() const { return m_fbnum; }
//    inline size_t numpx() const { return m_stride32 * m_height; }
//    inline size_t width() const { return m_stride32; }
//    inline size_t height() const { return m_height; }
//private: //emulate FB with SDL in XWindows: can't get XWindows FB driver to work :(
//    void devwindow(const timing_t& gpuinfo)
//    {
//        if (m_devwnd) return; //already open
//        m_devwnd = new DevWindow(gpuinfo.xres, gpuinfo.xtotal, gpuinfo.yres, gpuinfo.ytotal, gpuinfo.pxclock, gpuinfo.for_update);
//        m_pxbuf = m_devwnd->pxbuf();
//        m_stride32 = m_devwnd->width();
//        m_height = m_devwnd->height();
//    }
//    void devwindow()
//    {
//        if (m_devwnd) delete m_devwnd;
//        m_devwnd = 0;
//        m_pxbuf = 0;
//    }
private: //helpers
    void measure_clock(struct my_var_screeninfo& scrv)
    {
//        if (scrv.pixclock) return; //already have clock info
        if (scrv.has_pixclock()) return;
//check cached values:
//avoids additional delay when re-opening FB
        static std::map<decltype(m_fbnum), decltype(scrv.pixclock)> m_cache;
        auto found = m_cache.find(m_fbnum);
        if (found != m_cache.end()) RETURN(scrv.pixclock = found->second);
//measure it:
//            m_pixclock = measure_pixclock();
        timer_t<(int)1e6> clock; //no worky--NOTE: use nsec to detect timer wrap (validates NUMFR range)
#if 0
        decltype(clock)::elapsed_t test_usec = -clock.elapsed();
        debug("start %d, this@ %p", -test_usec, this);
        usleep(150);
        test_usec += clock.elapsed();
        debug("calibrate: 150 = %d", test_usec);
        test_usec = -clock.elapsed();
        usleep((int)3e3);
        test_usec += clock.elapsed();
        debug("calibrate: 3k = %d", test_usec);
#endif
        wait4sync(); //wait until start of next frame to get clean stats
        int frames = 0;
//TODO: adjust NUMFR based on (something) so delay period can be kept to 1 sec?
        CONSTDEF(NUMFR, 40); //CAUTION: elapsed time in usec must stay under ~ 2 sec to avoid overflow; 40 frames @60Hz ~= 667K, @30Hz ~= 1.3M, @20Hz == 2M usec
//        decltype(clock)::elapsed_t times[NUMFR];
        decltype(clock)::elapsed_t elapsed_usec = -clock.elapsed();
        while (frames++ < NUMFR) wait4sync(); //{ wait4sync(); times[frames - 1] = elapsed_usec + clock.elapsed(); }
//        debug("%'d + %'d", elapsed_usec, clock.elapsed());
        elapsed_usec += clock.elapsed();
//        for (int i = 1; i < NUMFR; ++i) times[i] -= times[i - 1]; //delta
//        for (int i = 0; i < NUMFR; ++i) 
//            debug("%scalibr[%d] = %'d, delta %'d", (i == 2 && NUMFR > 4)? (i = NUMFR - 2, "  ...\n"): "", i, times[i], i? times[i] - times[i - 1]: 0); //skip some entries
        if (elapsed_usec > (int)2e6) fatal("measure_clock %d took too long: %'d usec limit %'d", frames, elapsed_usec, clock.max);
//debug("%'d vs. %'u usec elapsed", elapsed_usec, elapsed_usec);
//wrong        pxclock = (unsigned long long)/*clock.elapsed()*/elaps * (int)1e6 / NUMFR; //<(int)1e6>(started_usec) * 1e6 / NUMFR; //use long long for max accuracy
        scrv.pixclock = rdiv(rdiv(rdiv(elapsed_usec, NUMFR) * (int)1e3, scrv.xtotal()) * (int)1e3, scrv.ytotal()); //usec => psec; kludge: split up 1e6 factor to prevent overflow
        debug("measured pix clock %'d psec = %'d usec / %'d frames / %'d xtotal / %'d ytotal, this@ %p", scrv.pixclock, elapsed_usec, NUMFR, scrv.xtotal(), scrv.ytotal(), this);
        if (!scrv.has_pixclock()) fatal("can't measure pixclock");
        m_cache[m_fbnum] = scrv.pixclock; //reuse result again later
    }
    void detailed_timing(struct my_var_screeninfo& scrv)
    {
        if (scrv.xtotal() != scrv.xres || scrv.ytotal() != scrv.yres) return; //already have sync info
//check cached values:
//avoids additional delay when re-opening FB
//        using details_t = std::tuple<decltype(scrv.right_margin), decltype(scrv.hsync_len), decltype(scrv.left_margin), decltype(scrv.lower_margin), decltype(scrv.vsync_len), decltype(scrv.upper_margin)>;
        struct details_t
        {
            decltype(scrv.right_margin) xfront, xsync, xback;
            decltype(scrv.lower_margin) yfront, ysync, yback;
        };
        static std::map<decltype(m_fbnum), details_t> m_cache;
        auto found = m_cache.find(m_fbnum);
        if (found != m_cache.end())
        {
            scrv.right_margin = found->second.xfront;
            scrv.hsync_len = found->second.xsync;
            scrv.left_margin = found->second.xback;
            scrv.lower_margin = found->second.yfront;
            scrv.vsync_len = found->second.xsync;
            scrv.upper_margin = found->second.xback;
            return;
        }
//try to get detailed timing info:
        const bool isRPi = fexists("/boot/config.txt"); //use __arm__ or __ARMEL__ macro instead?
//try to get detailed timing (RPi only):
        std::string str = isRPi? shell("vcgencmd get_config str"): ""; //try to get missing info for RPi; TODO: how to select FB if multiple?
//        str = shell("vcgencmd hdmi_timings");
//        if (str.size()) return str.c_str();
//        str = shell("vcgencmd get_config dpi_timings");
//        if (str.size()) return str.c_str();
        details_t details;
        for (auto end = 0U;;)
        {
            auto start = str.find("_timings", end); //NOTE: could be > 1 for RPi 4
            if (start == std::string::npos) break;
            end = str.find("\n", start);
            std::string timings = str.substr(start + 8, ((end != std::string::npos)? end: str.length()) - start - 8);
//                .map(line => line.match(/=\s*(\d+)\s+\d+\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+\s+(\d+)\s+(\d+)\s+(\d+)\s+/))
            int xres, yres, ignore; //xfront, xsync, xback, yres, yfront, ysync, yback, ignore;
//            details_t details;
            CONSTDEF(NUMVALS, 10);
            int nvals = sscanf(timings.c_str(), " = %d %d %d %d %d  %d %d %d %d %d ", // %d %d %d  %d %d %d %d ",
                &xres, &ignore, &details.xfront, &details.xsync, &details.xback,
                &yres, &ignore, &details.yfront, &details.ysync, &details.yback);
//            debug("found %d vals in detailed timing '%s' for fb#%d: xres %'d, xblank %'d+%'d+%'d, yres %'d, yblank %'d+%'d+%'d", nvals, timings.c_str(), m_fbnum, xres, details.xfront, details.xsync, details.xback, yres, details.yfront, details.ysync, details.yback);
            if (/*nvals &&*/ (nvals != NUMVALS)) { warn("invalid timing: '%s' (found %d vals, expected %d)", timings.c_str(), nvals, NUMVALS); continue; }
//printf("timing: nvals %d, str '%s'\n", nvals, ifnull(str, "(empty)"));
            if (xres != scrv.xres || yres != scrv.yres) { warn("skipping other timing: '%s' (!for xres %'d, yres %'d)", timings.c_str(), scrv.xres, scrv.yres); continue; }
            scrv.right_margin = details.xfront;
            scrv.hsync_len = details.xsync;
            scrv.left_margin = details.xback;
            scrv.lower_margin = details.yfront;
            scrv.vsync_len = details.ysync;
            scrv.upper_margin = details.yback;
            break;
        }
        if (scrv.xtotal() == scrv.xres && scrv.ytotal() == scrv.yres) fatal("detailed timing not available");
        m_cache[m_fbnum] = details; //reuse results again later
    }
};


//encapsulate FB update loop + open/close + WS protocol:
//can be run on fg or bkg thread
//mutex !needed; render threads use atomic access to control vars and there is only 1 writer thread
#include <atomic> //std::atomic<>
#include <stdint.h> //PRIu64, PRIx64, ...
//#include <climits> //INT_MAX
class FBloop: public AutoFB<>
{
protected: //allow children to see
    using SUPER = AutoFB<>;
    using self_t = FBloop;
public:
//h/w constraints:
#pragma message(TODO("allow caller to reduce #ports"))
    CONSTDEF(MAX_PORTS, 24); //maximum is fixed by GPU + VideoCore; each bit plane is a port or "universe"
    CONSTDEF(PORT_MASK, (1L << MAX_PORTS) - 1);
    CONSTDEF(WSNODE_USEC, 30); //fixed by WS281X protocol
    CONSTDEF(WSLATCH_USEC, 50); //fixed by WS281X protocol
    CONSTDEF(WSBITS, 24); //fixed by WS281X protocol
    CONSTDEF(PPB, 3); //fixed by SPI3x bit encoding
    CONSTDEF(L2ROWLEN, 64); //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both
public:
    struct brlimit_t
    {
        int brlimit[MAX_PORTS];
    };
//    static inline brlimit_t& m_brlimit() { static brlimit_t brlimit; return brlimit; } //kludge: avoid need for dangling static var declare
    brlimit_t& m_brlimit; //ref to shmem
    int m_univlen, m_univ_padlen;
//protect run-time thread control info with atomic access:
//    std::atomic<int> numrd, numwr, numfr;
//    std::atomic<int> job_count, job_wait, job_busy; //provide shared job stats for worker threads
//    std::atomic<int> upd_count, upd_idle, upd_pivot, upd_sync;
    struct stats_t
    {
//        union
//        {
//            struct { std::atomic<int32_t> numrd, frtime, numwr, numfr; } a; //worker thread ctl
//            std::atomic<int64_t> combo;
//        } u;
//        std::atomic<int32_t> frtime, numrd, numwr, numfr; //worker thread ctl
        /*std::atomic<uint32_t>*/ uint32_t ary[0]; //CAUTION: napi doesn't want atomic<> here
        std::atomic<uint32_t> delay_ready, delay_total, delay_count; //startup delay
        std::atomic<uint32_t> loop_total, loop_count, loop_idle, loop_pivot, loop_sync, loop_update; //bkg loop status/perf
//        std::atomic<uint32_t> upd_total, upd_count, upd_idle, upd_pivot, upd_sync; //bkg loop status
        std::atomic<uint32_t> render_total, render_count, render_idle, render_busy; //render status/perf; not used in here
        std::atomic<uint64_t> combo[0]; //used for atomic 64 overlay of endian test
        std::atomic<uint32_t> first32, last32; //endian test
    };
//    static inline stats_t& m_stats() { static stats_t stats; return stats; } //kludge: avoid need for dangling static var declare
    stats_t& m_stats; //ref to shmem
    static constexpr char* m_statsdir = "delay_ready, delay_total, delay_count, loop_total, loop_count, loop_idle, loop_pivot, loop_sync, loop_update, render_total, render_count, render_idle, render_busy, first32, last32"; //tell caller what's in stats
    static constexpr uint64_t ENDIAN_TEST = 0x123456789abcdefL;
//    int m_numbufs;
    using wsnode_t = uint32_t;
//    wsnode_t* m_wsnodes;
//    data_t* m_mempx;
public: //ctors/dtors
//ctor helpers:
//shim for ctor optional args:
    struct opts_t
    {
        decltype(m_fbnum) fbnum = 0;
//        bool rdwr;
        std::remove_cvref<decltype(m_brlimit.brlimit[0])>::type brlimit = 3 * 256 * 5/6;
//        int numbufs;
        brlimit_t* brlimit_ptr = 0;
        stats_t* stats_ptr = 0;
        int debug_level = -1;
//ctor/dtor:
        opts_t() //: fbnum(0), /*rdwr(false), xres(0), xblank(1), yres(0), linelen(0), ppb(3),*/ brlimit(3 * 256 * 5/6), /*numbufs(0),*/ debug_level(-1) //default 85% (50 mA/pixel)
        {
            for (fbnum = 4; fbnum > 0; --fbnum)
                if (AutoFB<>(fbnum, false).isOpen()) break; //default: use highest FB#
        }
//        opts_t(int want_fbnum = -1, const char* str = 0, int want_debug = 0): fbnum(want_fbnum), timing_ovr(ifnull(str)), debug_level(want_debug) {}; //CAUTION: don't init str to NULL; use ""
    };
//    utils(struct opts_t& opts): YALP(opts.fbnum, opts.timing_ovr.c_str(), opts.debug_level) {}
//    utils() { debug("utils@ %#p ctor", this); }
//    ~utils() { debug("utils@ %#p dtor", this); }
    FBloop() = delete; //don't allow implicit create
//    template <typename ... ARGS>
//    utils(Napi::Env env) //, ARGS&& ... args) //: m_shmptr(std::forward<ARGS>(args) ...) //, fremit(env) //perfect fwd; explicitly call ctor to init
    FBloop(const struct opts_t& opts): SUPER(opts.fbnum), m_brlimit(*opts.brlimit_ptr), m_stats(*opts.stats_ptr) //, opts.numbufs != 0) //, numrd(INT_MAX - 1) //, m_ppb(opts.ppb)
    {
        if (!opts.brlimit_ptr) fatal("missing brlimit (shared) ptr");
        if (!opts.stats_ptr) fatal("missing stats (shared) ptr");
//        debug("FBloop ctor@ %p, stats@ %p, brlimit@ %p", this, &m_stats, &m_brlimit);
//        debug("FBloop ctor@ %p", this);
//        m_frtime_usec = frtime_usec(); //save value to avoid re-calculating each frame
//        m_fbnum = opts.fbnum;
//        char fbname[30];
//        sprintf(fbname, "/dev/fb%d", m_fbnum);
//        m_fd = ::open(fbname, O_RDWR);
//#pragma message(YELLOW_MSG "TODO: use ioctl and shell to read this stuff in here" ENDCOLOR_NOLINE)
//        m_xres = opts.xres;
//        m_xblank = opts.xblank; //1; //default to 1/3 trailing low
//        m_yres = opts.yres;
//        /*m_yblank =*/
//        m_linelen = opts.linelen; //caller must supply these; config-dependent
//        m_ppb = opts.ppb; //3; //default to SPI 3x encoding
//        if (!m_ppb || xtotal() % m_ppb) warn("xtotal %d !multiple of ppb %d", xtotal(), m_ppb);
//        int vblank_usec = m_pixclock * xtotal() / 1e3 * m_yblank / 1e3; //psec -> usec; kludge: split up 1e6 factor to prevent overflow
//        if (vblank_usec < 50) warn("vblank too short: %d usec", vblank_usec);
        m_stats.combo[0] = ENDIAN_TEST; //endian flag
        for (int i = 0; i < /*SIZEOF(m_brlimit)*/ MAX_PORTS; ++i) m_brlimit.brlimit[i] = opts.brlimit; //3 * 256 * 5/6; //default to 85% brightness
//WS281X checking:
        int univlen_t = (frtime_usec() - WSLATCH_USEC) / WSNODE_USEC; //allow 50 usec for WS281X latch
        int univlen_r = xtotal() * m_yres / PPB / WSBITS; //50 usec = 50/1.25 == 40 bits for WS281X latch
        int rowgap = m_stride32 - m_xres; //fb.xtotal; //memory wasted/padding on each raster scan line
//        fb.numpx = fb.yres * fb.stride32;
//fb.ppb = 3; //SPI3x encoding
//console.log("fb", JSON.stringify(fb, (key, val) => (isUN(val, {}).length > 30)? `(${typeof val} len ${val.length})`: val, "  ")); //, Object.keys(fb));
        m_univlen = MIN(univlen_t, univlen_r);
        m_univ_padlen = u32len(divup(u8len(m_univlen), L2ROWLEN) * L2ROWLEN); //univ len padded to reduce L2 cache contention between threads
        debug("FBloop ctor@%p: %sunivlen (timing) %'d, %sunivlen (res) %'d%s, univlen L2 pad %'d, rowgap %'d, numpx %'d, rd/wr? %d", this, (m_univlen == univlen_t)? GREEN_MSG: YELLOW_MSG, univlen_t, (m_univlen == univlen_r)? GREEN_MSG: YELLOW_MSG, univlen_r, /*ENDCOLOR_NOLINE*/ BLUE_MSG, m_univ_padlen, rowgap, pxbuf_len32(), true);
        if (xtotal() % PPB || m_xblank > PPB / 3) fatal("xtotal %'d !multiple of ppb %d or xblank %d exceeds ppb/3, WS data bits will drop", xtotal(), PPB, m_xblank); //fb.xtotal - fb.xres);
        if (vblank_usec() < WSLATCH_USEC) fatal("vblank %'d usec too short for WS latch (must be >= %d usec)", vblank_usec(), WSLATCH_USEC);
//        m_mempx = opts.numbufs? new data_t[opts.numbufs * pxbuf_len32()]: 0;
//        if (m_mempx) m_numbufs = opts.numbufs;
    }
    ~FBloop() { debug("FBloop dtor@ %p", this); } //if (m_mempx) free(m_mempx); m_mempx = 0; m_numbufs = 0; }
public: //methods
//frame update loop:
//no throttling is possible, framebuf has fixed display time
//therefore this loop just blasts thru frbuf fifo regardless of whether ready or not
//NOTE: this should run on 1 bkg thread
//stats init done by caller (it decides when to clear them)
    void bkgloop(wsnode_t* frbufs, int numbufs, uint32_t portmask, int duration) //loop_status_t& status, int duration) //NUMFR)
    {
//        status.loop_total = status.loop_count = status.loop_idle = status.loop_sync = status.loop_update = 0; //perf
//        int m_frtime_usec = frtime_usec();
        if (!m_pxbuf) fatal("not open in rd/wr mode");
//        static constexpr PORT_MASK = 1 << MAX_PORTS - 1;
        if (!(portmask & PORT_MASK) || portmask & ~PORT_MASK /*s < 1 || numports > MAX_PORTS*/) fatal("invalid port mask: 0x%x, must have [1..%d] of 0x%x bits", portmask, MAX_PORTS, PORT_MASK);
        int numports = 0;
        for (int i = portmask; i; i >>= 1) if (i & 1) ++numports;
//        decltype(m_stats())& stats = m_stats();
        m_stats.combo[0] = ENDIAN_TEST; //set endian flag again in case caller cleared it
        int numfr = (uint64_t)duration * (int)1e3 / frtime_usec(); //CAUTION: prevent wrap for large duration
        debug("bkg loop start, duration %'d msec (buffered for %'d), #frames %'d+1 total, #portbufs %'d, #ports %d, portmask 0x%x", duration, divup((numbufs - 1) * frtime_usec(), (int)1e3), numfr, numbufs * numports, numports, portmask);
//        if (!m_numbufs) fatal("no frame buffers");
//        timer_t<(int)1e3> loop_clock; //set global start time (epoch), msec
//#define delta_init_2ARGS(epoch, now)  decltype(epoch)::elapsed_t now = epoch.elapsed(), chkpt = -now
//#define delta_2ARGS(epoch, now)  chkpt + (now = epoch.elapsed()); chkpt = -now
        delta_init(epoch, now); //::elapsed_t chkpt, now; delta(epoch); //= epoch.elapsed(), chkpt = -now;
//perf: mmaped fb memory seems to be as fast as local heap; don't need ioctl pandisplay and 2x height
#define PIVOT2LOCAL
#ifdef PIVOT2LOCAL //perf: mmap'ed takes same time as heap; HOWEVER, pivot makes ~ 10 - 20 msec which is > vblank time, so need to split this
//#pragma message(YELLOW_MSG "copying framebufs to intermediate memory" ENDCOLOR_NOLINE)
        pixel_t* pxbuf_mmap = m_pxbuf;
        m_pxbuf = new pixel_t[pxbuf_len32()];
#endif
        decltype(now) started = -now;
        m_stats.delay_total += -now;
//        stats.loop_total += -now;
        for (int frnum = 0;; ++frnum)
        {
            ++m_stats.delay_count;
            wait4sync(); //wait at least 1x for full timeslot
//            debug("bkg sync: delay[%'d] ready? %d", frnum, m_stats.delay_ready.load());
            if (m_stats.delay_ready) break; //allow caller to signal when ready
        }
        delta(epoch); //chkpt + (now = epoch.elapsed()); chkpt = -now;
        m_stats.delay_total += now;
        m_stats.loop_idle += -now; //initial time-tracking state == idle
//        numrd = 0; //reset this one last; render threads are waiting for it
//NOTE: caller should have already set initial state to allow workers to start rendering; DON'T init state here
//perf tips: see https://forums.raspberrypi.com/viewtopic.php?t=263873
        for (uint32_t frnum = 0; frnum <= numfr; ++frnum) //CAUTION: extra frame 0
        {
            if (!m_stats.delay_ready) break; //allow caller to cancel
//            uint32_t next_frtime = rdiv(frtime_usec() * (status.numfr = frnum + 1), (int)1e3); //NOTE: expected wakeup, not necessarily actual wakeup time; status.numfr is info only; don't use for loop control here in case another thread changes it
//            bool eof = (next_frtime >= duration);
            ++m_stats.loop_count;
            delta(epoch);
            m_stats.loop_total = frnum * frtime_usec() / (int)1e3; //for watchers only; not used by loop
            m_stats.loop_idle += now; //delta(epoch); //chkpt + (now = epoch.elapsed()); chkpt = -now;
#ifdef PIVOT2LOCAL //pivot too slow, pivot < sync and mem cpy > sync; uses move mem + adds extra mem cpy step, but avoids screen tear; TODO: double-buffer/pan vert instead
            m_stats.loop_pivot += -now;
//            if (frnum < 4) { pixel_t* bp = &frbufs[(frnum % numbufs) * (numports + 1) * m_univ_padlen]; debug("bkg loop frbuf[%'d] port[1] nodes '%'d: 0x%x 0x%x 0x%x 0x%x", frnum, bp - &frbufs[0], bp[0], bp[1], bp[2], bp[3]); }
//debug("pivot[%'d] using frbuf %'d", frnum, frnum % numbufs);
            ws3x_pivot(&frbufs[(frnum % numbufs) * numports * m_univ_padlen], portmask);
            delta(epoch);
            m_stats.loop_pivot += now; //delta(epoch); //chkpt + (now = epoch.elapsed()); chkpt = -now;
            m_stats.loop_sync += -now;
            wait4sync(); //frtime_usec()); //wait for next frame (to avoid screen tear)
//            debug("bkg sync: fr[%'d/%'d] %'d/%'d msec, eof? %d", frnum, numfr, m_stats.loop_total.load(), duration, frnum == numfr);
            delta(epoch);
            m_stats.loop_sync += now; //delta(epoch); //chkpt + (now = epoch.elapsed()); chkpt = -now;
            m_stats.loop_update += -now;
            memcpy(pxbuf_mmap, m_pxbuf, u8len(pxbuf_len32())); //update FB right after sync (to avoid screen tear)
            delta(epoch);
            m_stats.loop_update += now; //delta(epoch); //chkpt + (now = epoch.elapsed()); chkpt = -now;
#else //pivot directly into pxbuf (avoids extra mem cpy)
            m_stats.loop_sync += -now;
            wait4sync(); //frtime_usec()); //wait for next frame (to avoid screen tear)
//            debug("bkg sync: fr[%'d/%'d] %'d/%'d msec, eof? %d", frnum, numfr, m_stats.loop_total.load(), duration, frnum == numfr);
            delta(epoch);
            m_stats.loop_sync += now; //delta(epoch); //chkpt + (now = epoch.elapsed()); chkpt = -now;
            m_stats.loop_pivot += -now;
            ws3x_pivot(&frbufs[(frnum % numbufs) * numports * m_univ_padlen], portmask);
            delta(epoch);
            m_stats.loop_pivot += now; //delta(epoch); //chkpt + (now = epoch.elapsed()); chkpt = -now;
#endif
            m_stats.loop_idle += -now;
//            memcpy(m_pxbuf, &m_mempx[(frnum % m_numbufs) * pxbuf_len32()], u32len(pxbuf_len32())); //update FB in memory after sync (to avoid screen tear)
//            stats.loop_update += delta(epoch); //chkpt + (now = epoch.elapsed()); chkpt = -now;
        }
        delta(epoch);
        m_stats.loop_idle += now; //delta(epoch, now); //chkpt + (now = epoch.elapsed()); chkpt = -now;
//        stats.loop_total += now;
        started += now;
#ifdef PIVOT2LOCAL
        delete[] m_pxbuf;
        m_pxbuf = pxbuf_mmap;
#endif
        debug("bkg loop finish after %'d msec, %'d frames, avg %'d msec/frame", started, numfr, rdiv(started, numfr));
    }
#if 0
    void X_bkgloop(loop_status_t& status, wsnode_t* wsnodes, int duration) //NUMFR)
    {
//        NUMFR = eof;
//        std::atomic<int> numrd, frtime, numwr, numfr;
//        status.numwr = numfr = 0;
//        job_count = job_wait = job_busy = 0;
        uint64_t save = status.combo[2];
        status.combo[2] = 0x123456789abcdefL;
        bool isBE = (status.first32 == 0x1234567) && (status.last32 == 0x89abcdef);
        bool isLE = (status.first32 == 0x89abcdef) && (status.last32 == 0x1234567);
        debug("u64 endian test: [0x%x, 0x%x] BE? %d, LE? %d", status.first32.load(), status.last32.load(), isBE, isLE);
        status.combo[2] = save;
        status.upd_count = status.upd_idle = status.upd_pivot = status.upd_sync = 0;
//        timer_t<(int)1e3> loop_clock; //set global start time (epoch), msec
        decltype(epoch)::elapsed_t now = epoch.elapsed(), chkpt = status.upd_total = -now;
        debug("bkg loop start with [%'d, %'d, %'d, %'d, 0x%x, 0x%x], run for %'d msec", status.numrd.load(), status.frtime.load(), status.numwr.load(), status.numfr.load(), status.first32.load(), status.last32.load(), duration);
//        numrd = 0; //reset this one last; render threads are waiting for it
//NOTE: caller should have already set initial state to allow workers to start rendering; DON'T init state here
        for (uint32_t frnum = 0;; ++frnum)
        {
            bool ready = !(status.numwr < NUM_PORTS); //render not complete (shouldn't happen if workers are fast enough)
            if (ready) //all ports rendered
            {
                ++status.upd_count;
                now = epoch.elapsed();
                status.upd_idle += chkpt + now; chkpt = -now;
                ws3x_pivot(wsnodes); //, m_mempx); //s, m_pxbuf, frtime);
#pragma message(TODO(read next fseq frame))
                now = epoch.elapsed();
                status.upd_pivot += chkpt + now; chkpt = -now;
            }
            uint32_t next_frtime = rdiv(frtime_usec() * (status.numfr = frnum + 1), (int)1e3); //NOTE: expected wakeup, not necessarily actual wakeup time; status.numfr is info only; don't use for loop control here in case another thread changes it
            bool eof = (next_frtime >= duration);
            if (ready) status.combo[0] = isBE? (uint64_t)next_frtime << 32: (uint64_t)next_frtime; // numrd = 0; //ignore excess, allow render threads to resume; atomic upd frtime + numrd
            wait4sync(); //wait for next frame (to avoid screen tear)
//NOTE: this is when wakeup *should* have happened, not necessarily when it *did*
//we want to tell workers what time to render for; actual frame buffer update time doesn't need to be precise as long as it's during vblank (to avoid tear)
//TODO: maybe use double-buffering and pan up/down?
            debug("bkg loop render ready? %d, frame[%'d] %'d msec, eof? %d [%'d, %'d, (0x%" PRIx64 "), %'d, %'d, 0x%x, 0x%x]", ready, status.numfr.load() - 1, next_frtime, eof, status.frtime.load(), status.numrd.load(), status.combo[0].load(), status.numwr.load(), status.numfr.load(), status.first32.load(), status.last32.load());
            if (eof) break;
            if (!ready) continue;
            memcpy(m_pxbuf, m_mempx, u32len(pxbuf_len32())); //update FB in memory after first sync (to avoid screen tear)
            now = epoch.elapsed();
            status.upd_sync += chkpt + now; chkpt = -now;
            status.numwr -= NUM_PORTS; //only remove jobs from completed cycle, preserve pre-completed work on next cycle
            debug("bkg loop next frame: #rd %d, #wr %d, frtime %'d msec, eof? %d", status.numrd.load(), status.numwr.load(), status.frtime.load(), eof); //"#wr bump back, new val:", shmbuf.numwr); //Atomics.load(shmbuf, 1));
        }
        now = epoch.elapsed();
        status.upd_idle += chkpt + now; chkpt = -now;
        status.upd_total += now;
        debug("bkg loop finish after %'d msec", status.upd_total.load());
    }
#endif
private: //helpers
    int pivot_count = 0;
//NOTE: this *can* run on any thread, but it's currently only embedded in bkg loop:
    void ws3x_pivot(const wsnode_t* nodes1D, uint32_t portmask) //, int bufnum) //data_t* mempx) //, uint32_t* pxbuf, int num_nodes)
    {
        static constexpr pixel_t BLACK = 0xff000000; //alpha on, r/g/b/ off
        static constexpr pixel_t WHITE = 0xffffffff; //alpha on, r/g/b/ on
        static constexpr uint32_t WSMSB = 1 << (WSBITS - 1); //0x800000; //msb of ws data
//        int UNIV_LEN = num_nodes / NUM_PORTS, gaplen = m_stride32 - xtotal();
        int gaplen = m_stride32 - xtotal(); //m_xres; //fb.xtotal; //memory wasted/padding on each raster scan line
        decltype(epoch)::elapsed_t started = -epoch.elapsed();
//        debug("TODO: pivot %p -> %p", nodes2D, pxbuf);
#pragma message(YELLOW_MSG "TODO: add port data len, dirty flags, add frbuf delay time to bkgloop, allow ports to be skipped (no start bit, use mask instead of WHITE, uses more (fixed amt of) memory), swap colors, set #nullpx in pivot, alpha blending? (bkg xparent color)" ENDCOLOR_NOLINE)
//        if (bufnum < 0 || bufnum >= m_numbuf)
//        if (!m_numbufs) fatal("no frame buffers");
//        data_t* const mempx = &m_mempx[(bufnum % m_numbufs) * pxbuf_len32()]; //circular fifo
        pixel_t* bp = &m_pxbuf[0]; //rewind
        pixel_t* eol = bp + xtotal(); //set first gap; NOTE: must be multiple of ppb (3)
        if (!pivot_count) debug("ws3x_pivot[%'d]: nodes1D %p, mempx buf %p %svs. mine %p%s, UNIV_LEN %'d (padded %'d), port mask 0x%x/0x%x, msb 0x%x, gaplen %d, msb rgb 0x%x, ws msb 0x%x", pivot_count, nodes1D, m_pxbuf, (m_pxbuf == m_pxbuf)? GREEN_MSG: YELLOW_MSG, m_pxbuf, ENDCOLOR_NOLINE, m_univlen, m_univ_padlen, portmask, PORT_MASK, msb(PORT_MASK), gaplen, msb(WHITE & ~BLACK), WSMSB);
        for (int node = 0; node < m_univlen; ++node)
        {
            pixel_t cached[MAX_PORTS];
//            for (int port = 0; port < numports; ++port) 
//            for (uint32_t portbit = 1 << (MAX_PORTS - 1), port = 0; portbit; portbit >>= 1, ++port)
//            static constexpr uint32_t MSB = 1 << (32 - 1); //0x80000000;
//            for (uint32_t portbits = portmask << (32 - MAX_PORTS), port = 0, portofs = 0; portbits; portbit <<= 1)
            for (uint32_t portbits = portmask, port = 0, portofs = 0; portbits & PORT_MASK; portbits <<= 1, portofs += m_univ_padlen)
                if (portbits & msb(PORT_MASK)) //encode this port
//perf: ~1 msec extra with limit()
//                {
//if (port >= 24) fatal("bad port: %d", port);
//if (portofs + node >= 24 * 1616) fatal("bad node: %'d + %'d", portofs, node);
                    cached[port++] = limit(nodes1D[portofs + node], m_brlimit.brlimit[port]); //limit brightness + localize memory access for bit loop
//                }
//  if (node > 50)
//        for (int i = 0; i < MAX_PORTS; ++i) cached[i] = 0;
//#if 1
//            if (pivot_count < 2 && node < 8) debug("pivot: port[1] node[%'d] 0x%x, maxbr 0x%x => cached[1] 0x%x", node, nodes1D[m_univ_padlen + node], m_brlimit.brlimit[1], cached[1]);
//#endif
//TODO: look for prop-level commands, including max brightness
//            static constexpr pixel_t RGBMSB = msb(WHITE & ~BLACK);
            for (uint32_t wsbit = WSMSB; wsbit; wsbit >>= 1) //generate ws data bits, msb first
            {
                *bp++ = WHITE; //-1; //start of bit
                if (bp == eol) fatal("gap in wrong place1: node %'d, bit 0x%x, bp %'d", node, wsbit, bp - &m_pxbuf[0]);
                pixel_t pxbits = BLACK;
//                for (data_t port = 0, portbit = 1 << (numports - 1); port < numports; ++port, portbit >>= 1)
                for (uint32_t portbits = portmask, port = 0, pxbit = msb(WHITE & ~BLACK); portbits & PORT_MASK; portbits <<= 1, pxbit >>= 1)
                    if ((portbits & msb(PORT_MASK)) && (cached[port++] & wsbit)) pxbits |= pxbit;
                *bp++ = pxbits; //live part of bit, 1 bit for each port
                if (bp == eol) fatal("gap in wrong place2: node %'d, bit 0x%x, bp %'d", node, wsbit, bp - &m_pxbuf[0]);
                *bp++ = BLACK; //0xff000000; //end of bit
                if (!pivot_count && bp == eol && node < 300 && wsbit & 0x010101) debug("eol @node %'d, bit 0x%x, bp %'d", node, wsbit, bp - &m_pxbuf[0]);
//first try: too noticeable with 00/01 color levels               if (bp == eol && wsbit & 0x010101) bp[-2] = BLACK; //UGLY KLUDGE: move 0x01 bit up/back to 0x02 (to preserve nearly-off color); won't notice if higher color bits are set; don't let slip to msb of next color; TODO: figure out why 0x01 is being delayed!  happens @node 43, 87, 131, 154, 221
#pragma message(YELLOW_MSG "trying drop all bits @rhs" ENDCOLOR_NOLINE)
                if (bp == eol) bp[-2] = BLACK; // && wsbit & 0x010101) { bp[-5] |= bp[-2]; bp[-2] = BLACK; } //UGLY KLUDGE: move 0x01 bit up/back to 0x02 (to preserve nearly-off color); won't notice if higher color bits are set; don't let slip to msb of next color; TODO: figure out why 0x01 is being delayed!  happens @node 43, 87, 131, 154, 221; second try !noticeable with 01/02 color levels
//was: 0101.01 => 0?0?80,   01.0101 => 0?800?,   010101. 010101 => 010101 800?0?
//first try: 0101.01 => 010001,   01.0101 => 000101,   010101. 010101 => 010100 010101
//second try: 0101.01 => 010201,   01.0101 => 020101,   010101. 010101 => 010101 010101
                if (bp == eol) eol = xtotal() + (bp += gaplen); //skip fb gap at end of each raster line; should only occur during bit trailer else ws bit will drop
            }
        }
        int junklen = &m_pxbuf[pxbuf_len32()] - bp;
        for (int i = 0; i < junklen; ++i) *bp++ = BLACK; //clear junk after last node; start WS latch period (no start bits)
//#if 0
        if (pivot_count) return; //++ /*> 5*/) return;
        started += epoch.elapsed();
//        debug("ws3x_pivot[%'d]: nodes1D %p, mempx buf %p %svs. mine %p%s, UNIV_LEN %'d (padded %'d), port mask 0x%x/0x%x, gaplen %d", pivot_count - 1, nodes1D, m_pxbuf, (m_pxbuf == m_pxbuf)? GREEN_MSG: YELLOW_MSG, m_pxbuf, ENDCOLOR_NOLINE, m_univlen, m_univ_padlen, portmask, PORT_MASK, gaplen);
        debug("redraw[%'d] eof: x %'d/%'d, y %'d/%'d, gaplen %d, junk @end %'d, took %'d msec", pivot_count, (bp - &m_pxbuf[0]) % /*xtotal()*/ m_stride32, m_xres, (bp - &m_pxbuf[0]) / m_stride32 /*xtotal()*/, m_yres, gaplen, junklen, started);
        dump(pivot_count);
        ++pivot_count;
//#endif
    }
//private: //helpers
    inline static wsnode_t limit(wsnode_t color, int LIMIT3)
    {
        if (!LIMIT3) return color;
        int r = R(color), g = G(color), b = B(color);
        int br = r + g + b; //brightness(color);
        if (br <= LIMIT3/*_BRIGHTNESS * 3*/) return color; //TODO: maybe always do it? (to keep relative brightness correct)
//TODO: cache results?
//NOTE: palette-based nodes would make this more efficient
//    return toARGB(A(color), r, g, b);
//linear calculation is more efficient but less accurate than HSV conversion+adjust:
        int dimr = r * LIMIT3/*_BRIGHTNESS * 3*/ / br;
        int dimg = g * LIMIT3/*_BRIGHTNESS * 3*/ / br;
        int dimb = b * LIMIT3/*_BRIGHTNESS * 3*/ / br;
//debug("r %d * %d / %d => %d, g %d * %d / %d => %d, b %d * %d / %d => %d", r, 3 * LIMIT_BRIGHTNESS, br, dimr, g, 3 * LIMIT_BRIGHTNESS, br, dimg, b, 3 * LIMIT_BRIGHTNESS, br, dimb);
        return Abits(color) | (dimr << 16) | (dimg << 8) | (dimb << 0); //LIMIT3 / br < 1; don't need clamp()
    }
    void dump(int label) //debug only
    {
        char fname[30];
        sprintf(fname, "/tmp/dump-%d.txt", label);
        FILE* fp = fopen(fname, "w");
        if (!fp) fatal("can't create file '%s'", fname);
        fprintf(fp, "frtime %'d usec, %d fps\n", frtime_usec(), fps());
        fprintf(fp, "xres: %'d+%'d, stride32 %'d-%'d, yres: %'d+%'d, size32 %'d\n", m_xres, xtotal() - m_xres, m_stride32, m_stride32 - xtotal(), m_yres, ytotal() - m_yres, pxbuf_len32());
        CONSTDEF(PER_LINE, 15); //16); //use multiple of 3 to get better repeating matches
//        for (int xy = 0; xy < pxbuf_len32(); xy += 16)
        for (int y = 0, yofs = 0; y < m_yres; ++y, yofs += m_stride32)
            for (int xofs = 0; xofs < m_stride32; xofs += PER_LINE)
            {
                char buf[300]; buf[0] = '\0';
                int outlen = MIN(m_stride32 - xofs, PER_LINE);
                for (int x = xofs; x < xofs + outlen; ++x) sprintf(buf + strlen(buf), m_pxbuf[yofs + x] < 10? " %d": " x%x", m_pxbuf[yofs + x]);
                if ((yofs + xofs) && (yofs + xofs + outlen < pxbuf_len32()) && !memcmp(m_pxbuf + yofs + xofs - PER_LINE, m_pxbuf + yofs + xofs, outlen)) continue; //skip repeating data except @end
                fprintf(fp, "[%'d/%'d, %'d/%'d] @%p:%s\n", y, m_yres, xofs, m_stride32, m_pxbuf + yofs + xofs, buf);
            }
        fprintf(fp, "-end-\n");
        fclose(fp);
    }
};


//main API wrapper object:
//#pragma message(YELLOW_MSG "TODO: use shm?  won't work for m_fd/mmap, but will save re-run vcgencmd" ENDCOLOR_NOLINE)
class FB//: public AutoFB<>
{
private:
    using self_t = FB;
//    using SUPER = AutoFB<>;
//    using wsnode_t = uint32_t;
    NAPI_START_EXPORTS(self_t); //, CLS_T);
protected: //allow children to see
//    static constexpr int NUM_PORTS = 24, &m_NUM_PORTS = NUM_PORTS; //fixed by GPU + VideoCore
//    CONSTDEF(NUM_PORTS, 24); //fixed by GPU + VideoCore
//    int m_fd;
//    int32_t m_fbnum, m_xres, m_xblank, m_yres, /*m_yblank,*/ m_linelen;
//    int m_ppb;
//    int m_frtime_usec; //cached
//    int32_t m_brlimit[NUM_PORTS];
//    inline static FBloop& m_fbloop(const FBloop::opts_t& opts) { static FBloop fbloop(opts); return fbloop; } //kludge: wrapper to avoid trailing decl
//    inline static FBloop& m_fbloop() { static FBloop::opts_t def_opts; return m_fbloop(def_opts); }
    FBloop m_fbloop;
//    const Napi::Buffer<uint_fast8_t > &napiBuf0 = info[0].As<Napi::Buffer<uint_fast8_t>>();
//    Napi::Reference<Napi::Buffer<uint_fast8_t>> buf0ref = Napi::Reference<Napi::Buffer<uint_fast8_t>>::New(napiBuf0, 1);
//    NapiBufInfo m_shmdata; //kludge: hold on to shmbuf from JS caller; napi !support SharedArrayBuffer :(
//public:
#if 0 //getters/setters not visible on obj :(, caller might not check prototype
private:
//properties:
//    GETTER(get_num_ports, (int)NUM_PORTS);
//    NAPI_EXPORT_PROPERTY(self_t, NUM_PORTS, get_num_ports);
    inline int num_ports() const { return (int)NUM_PORTS; } //shim
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, NUM_PORTS, num_ports()); //(int)NUM_PORTS);
//    GETTER(xres);
//    SETTER(xres);
//    int get_xres() { return m_xres; }
//    void set_xres(int newval) { m_xres = newval; }
//    NAPI_EXPORT_PROPERTY(self_t, "xres", get_xres, set_xres);
//    NAPI_EXPORT_RDWR_PROPERTY(self_t, fd, m_fd);
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, fbnum, m_fbnum);
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, xres, m_xres);
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, xblank, m_xblank);
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, yres, m_yres);
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, yblank, m_yblank);
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, stride32, m_stride32);
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, pixclock_psec, m_pixclock);
//    NAPI_EXPORT_RDONLY_PROPERTY(self_t, pxbuf_len32, pxbuf_len32());
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, frtime_usec, m_frtime_usec);
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, vblank_usec, vblank_usec()); //, NULL_OF(self_t)); //std::declval<self_t>().vblank_usec());
//    decltype(NULL_OF(AutoFB)->vblank_usec()) my_vblank_usec() const { return vblank_usec(); }
//    GETTER(get_vblank_usec, vblank_usec());
//    std::decltype(NULL_OF(AutoFB)->vblank_usec()) get_vblank_usec() const { return vblank_usec(); }
//    std::decltype((NULL_OF(AutoFB)->vblank_usec())) get_vblank_usec() const { return vblank_usec(); }
//    decltype(NULL_OF(self_t)->my_vblank_usec()) get_vblank_usec() const { return vblank_usec(); }
//    NAPI_EXPORT_PROPERTY(self_t, "vblank_usec", get_vblank_usec);
//NAPI_GETTER(cls, getter);
//NAPI_ADD_EXPORT(cls, name, Accessor, &WrapType::THISLINE(cls_getter_napi), nullptr, my_napi_default_prop)
//    decltype(get_return_type(&A::f)) g(int x);
//    decltype(get_return_type(&A::h).f(0)) k(int x);
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, FPS, fps()); //std::declval<self_t>().fps());
//    NAPI_EXPORT_RDONLY_PROPERTY(self_t, ppb, m_ppb);
    NAPI_EXPORT_RDONLY_PROPERTY(self_t, order, m_order); //[](){ return std::string(m_order); }); //std::string(m_order));
//    NAPI_EXPORT_RDONLY_PROPERTY(self_t, elapsed, m_shmptr->stats.elapsed_msec); //[this]() { return elapsed<(int)1e3>(stats.started.load()); }); //aget_elapsed_msec);
//#else
//    NAPI_GETTER(self_t, (int)NUM_PORTS, get_num_ports); //(int)NUM_PORTS);
//    NAPI_GETTER(self_t, m_fbnum, get_fbnum);
//    NAPI_GETTER(self_t, m_xres, get_xres);
//    NAPI_GETTER(self_t, m_xblank, get_xblank);
//    NAPI_GETTER(self_t, m_yres, get_yres);
//    NAPI_GETTER(self_t, m_yblank, get_yblank);
//    NAPI_GETTER(self_t, m_stride32, get_stride32);
//    NAPI_GETTER(self_t, m_pixclock, get_pixclock);
//    NAPI_GETTER(self_t, m_frtime_usec, get_frtime_usec);
//    NAPI_GETTER(self_t, vblank_usec(), get_vblank_usec); //, NULL_OF(self_t)); //std::declval<self_t>().vblank_usec());
//    NAPI_GETTER(self_t, fps(), get_fps); //std::declval<self_t>().fps());
//    NAPI_GETTER(self_t, m_order, get_order); //[](){ return std::string(m_order); }); //std::string(m_order));
//run-time stats + thread control:
//    NAPI_EXPORT_RDWR_PROPERTY(self_t, vblank_usec, vblank_usec()); //, NULL_OF(self_t)); //std::declval<self_t>().vblank_usec());
//    NAPI_EXPORT_PROPERTY(self_t, "numrd", m_fbloop().numrd.load, m_fbloop().numrd.store); //JS can update
//    NAPI_EXPORT_PROPERTY(self_t, "numwr", m_fbloop().numwr.load, m_fbloop().numwr.store); //JS can update
//    NAPI_EXPORT_PROPERTY(self_t, "numfr", m_fbloop().numfr.load, m_fbloop().numfr.store); //JS can update
//    NAPI_EXPORT_PROPERTY(self_t, "job_count", m_fbloop().job_count.load, m_fbloop().job_count.store); //JS can update
//    NAPI_EXPORT_PROPERTY(self_t, "job_wait", m_fbloop().job_wait.load, m_fbloop().job_wait.store); //JS can update
//    NAPI_EXPORT_PROPERTY(self_t, "job_busy", m_fbloop().job_busy.load, m_fbloop().job_busy.store); //JS can update
//    NAPI_EXPORT_PROPERTY(self_t, "upd_count", m_fbloop().upd_count.load, m_fbloop().upd_count.store); //JS can update
//    NAPI_EXPORT_PROPERTY(self_t, "upd_idle", m_fbloop().upd_idle.load, m_fbloop().upd_idle.store); //JS can update
//    NAPI_EXPORT_PROPERTY(self_t, "upd_pivot", m_fbloop().upd_pivot.load, m_fbloop().upd_pivot.store); //JS can update
//    NAPI_EXPORT_PROPERTY(self_t, "upd_sync", m_fbloop().upd_sync.load, m_fbloop().upd_sync.store); //JS can update
#endif //0
//#ifdef USING_NAPI //brightness limit, node encoding:
#if 0 //BROKEN- can't use same addr for mult inst (across threads)  :(
    Napi::Value brlimit_getter(const Napi::CallbackInfo &info)
    {
//        debug("brlimit_getter ...");
        /*Napi::ArrayBuffer*/ auto arybuf = Napi::ArrayBuffer::New(info.Env(), &m_fbloop.m_brlimit.brlimit[0], sizeof(m_fbloop.m_brlimit.brlimit)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        auto retary = Napi::TypedArrayOf<std::remove_cvref<decltype(m_fbloop.m_brlimit.brlimit[0])>::type /*int32_t*/>::New(info.Env(), SIZEOF(m_fbloop.m_brlimit.brlimit), arybuf, 0, napi_int32_array); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
//        debug("... brlimit_getter");
        Napi::ObjectReference retval = Napi::ObjectReference::New(retary, 1); //TODO: when to unref?
        return retval.Value(); //retary;
    }
//    NAPI_EXPORT_WRAPPED_PROPERTY(self_t, "brlimit", brlimit_getter);
    Napi::Value stats_getter(const Napi::CallbackInfo &info)
    {
//        debug("brlimit_getter ...");
        /*Napi::ArrayBuffer*/ auto arybuf = Napi::ArrayBuffer::New(info.Env(), &m_fbloop.m_stats.ary[0], sizeof(m_fbloop.m_stats)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        auto retary = Napi::TypedArrayOf<std::remove_cvref<decltype(m_fbloop.m_stats.ary[0])>::type /*int32_t*/>::New(info.Env(), sizeof(m_fbloop.m_stats) / sizeof(m_fbloop.m_stats.ary[0]), arybuf, 0, napi_uint32_array); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
//        debug("... brlimit_getter");
        Napi::ObjectReference retval = Napi::ObjectReference::New(retary, 1); //TODO: when to unref?
        return retval.Value(); //retary;
    }
//    NAPI_EXPORT_WRAPPED_PROPERTY(self_t, "stats", stats_getter);
#endif
#if 0 //moved into FBloop
    Napi::Value pxbuf_getter(const Napi::CallbackInfo &info)
    {
//        debug("pxbuf_getter ...");
        /*Napi::ArrayBuffer*/ auto arybuf = Napi::ArrayBuffer::New(info.Env(), &m_pxbuf[0], pxbuf_len32() * sizeof(m_pxbuf[0])); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        auto retary = Napi::TypedArrayOf<std::remove_cvref<decltype(m_pxbuf[0])>::type /*int32_t*/>::New(info.Env(), pxbuf_len32(), arybuf, 0, napi_uint32_array); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
//        debug("... brlimit_getter");
        return retary;
    }
//    NAPI_EXPORT_WRAPPED_PROPERTY(self_t, "pxbuf", pxbuf_getter);
#endif //def USING_NAPI
//methods:
#ifdef USING_NAPI
//leave these in for timing, not used for framebuffer update loop:
    Napi::Value wait4sync_method(const Napi::CallbackInfo &args) //CAUTION: blocks main thread up to 50 msec (@20 FPS)
    {
        if (args.Length()) return err_napi(args.Env(), "no args expected, got %d: %s", args.Length(), NapiArgType(args, 0));
        bool retval = (m_fbloop.wait4sync(m_fbloop.frtime_usec()) >= 0);
        return Napi::Boolean::New(args.Env(), retval);
    }
    NAPI_EXPORT_METHOD(self_t, "wait4sync", /*m_ptr->*/wait4sync_method);
    template<typename RETVAL_T = int32_t, /*typename ARYVAL_T = uint32_t,*/ class SUPER = Napi::AsyncWorker>
    class Await4syncAsyncWker: public SUPER
    {
        self_t* m_ptr;
        Napi::Promise::Deferred m_deferred;
        int m_delay;
//        void* m_data; //ARYVAL_T* m_data;
        RETVAL_T m_retval; //data type ret from non-JS to JS, *not* wker to caller
    public:
        Await4syncAsyncWker(const Napi::Env& env, self_t* ptr, int delay/*, void* data*/): SUPER(env), m_ptr(ptr), m_delay(delay), /*m_data(data),*/ m_deferred(Napi::Promise::Deferred::New(env)) { this->Queue(); } //debug("wker ctor"); }
        ~Await4syncAsyncWker() { } //debug("wker dtor"); }
    public:
        Napi::Promise::Deferred& def() /*const*/ { return m_deferred; }
        void Execute() //runs inside wker thread; CAUTION: cannot access JS
        {
            debug("wker exec start, delay %d", m_delay); //data xfr? %d", !!m_data);
//epoch !thread safe?
//            timer_t<(int)1e3> clock;
//            decltype(epoch)::elapsed_t started = epoch.elapsed();
//            struct timeval started;
            decltype(epoch)::elapsed_t elapsed_msec, started = epoch.elapsed(); //, busy = -1; //, now = started;
//            int busy = 0, sleep = 0;
//            struct timezone& tz = *NULL_OF(struct timezone); //relative times don't need this
//            if (gettimeofday(&started, &tz)) fatal("get time of day failed");
//            const int UNITS = (int)1e3;
//            using ELAPSED_T = uint32_t;
//            const unsigned int MAX_SEC = (ELAPSED_T)-1 / UNITS;
            int frtime_usec = m_ptr->m_fbloop.frtime_usec();
            for (int count = 0;;)
            {
//                busy -= now; now = epoch.elapsed(); busy += now;
                m_retval = m_ptr->m_fbloop.wait4sync(frtime_usec); //try to maintain timing if no sync; waits at least 1 frame
//                sleep -= now; now = epoch.elapsed(); sleep += now;
//memcpy(120K) takes < 1 msec; don't need to track it
//                if (m_data) { /*busy = -epoch.elapsed();*/ memcpy(m_ptr->m_pxbuf, m_data, u32len(m_ptr->pxbuf_len32())); m_data = 0; } //busy += epoch.elapsed(); } //update FB in memory after first sync (to avoid screen tear)
                if (m_retval >= 0) m_retval = ++count; //ret #frames waited
//epoch !thread safe?
//                if (m_retval < 0) break; //error
//                decltype(started) elapsed_msec = epoch.elapsed() - started;
//                struct timeval now;
//                if (gettimeofday(&now, &tz)) fatal("get time of day failed");
//                now.tv_sec -= started.tv_sec;
//                now.tv_usec -= started.tv_usec;
//                if (now.tv_sec < 0 || now.tv_sec >= MAX_SEC) fatal("%'d sec wrap @T+%'d sec; limit was %'u sec", UNITS, now.tv_sec, MAX_SEC);
//                ELAPSED_T elapsed_msec = now.tv_sec * UNITS + now.tv_usec / ((int)1e6 / UNITS);
                /*decltype(epoch)::elapsed_t*/ elapsed_msec = epoch.elapsed() - started;
//                debug("loop[%'d]: msec remaining %'d", count, m_delay - elapsed_msec);
                if (elapsed_msec >= m_delay - 2) break; //allow 2 msec slop for overhead
            }
            debug("wker exec done after %'d msec", elapsed_msec); //(memcpy %'d took %'d)", elapsed_msec, m_ptr->pxbuf_len32(), busy);
        }
        void OnOK() //runs inside main evt loop; safe to use JS data
        {
//            debug("wker on ok");
            m_deferred.Resolve(Napi::Number::New(this->Env(), m_retval)); //ret error# or #frames waited to caller
        }
        void OnError(Napi::Error const& error) { debug("wker on err"); m_deferred.Reject(error.Value()); }
    };
    Napi::Value await4sync_method(const Napi::CallbackInfo &args) //async !blocks main thread
    {
//        if (args.Length() > 2 || (args.Length() && !args[0].IsNumber()) || (args.Length() > 1 && !NapiBufInfo::IsOK(args[1]))) return err_napi(args.Env(), "delay_msec (optional Number) + px buf (optional TypedArray/ArrayBuffer/Buffer) expected, got %d: %s %s", args.Length(), NapiArgType(args, 0), NapiArgType(args, 1));
        if (args.Length() > 1 || (args.Length() && !args[0].IsNumber())) return err_napi(args.Env(), "delay_msec (optional Number) expected, got %d: %s %s", args.Length(), NapiArgType(args, 0));
        int delay_msec = args.Length()? napi2val<int>(args[0]): 0;
//        Napi::Buffer<uint32_t> pxbuf = ((args.Length() >= 2) && args[1].IsBuffer())? args[1].As<Napi::Buffer<uint32_t>>(): Napi::Buffer<uint32_t>::New(args.Env(), NULL, 0); //, finalizer, hint*);
//        void* pxdata = 0;
//        int bytelen;
//        if (args.Length() >= 2) //caller wants me to update FB mem; allow various buf types
//        {
//            if (args[1].IsTypedArray())
//            {
//                Napi::TypedArrayOf<uint32_t> pxbuf = args[1].As<Napi::TypedArrayOf<uint32_t>>(); //.Data(): 0; //: Napi::TypedArrayOf<uint32_t>::New(args.Env(), NULL, 0); //, finalizer, hint*);
//                bytelen = pxbuf.ByteLength();
//                pxdata = pxbuf.Data();
//            }
//            else if (args[1].IsArrayBuffer())
//            {
//                Napi::ArrayBuffer pxbuf = args[1].As<Napi::ArrayBuffer>(); //.Data(): 0; //: Napi::TypedArrayOf<uint32_t>::New(args.Env(), NULL, 0); //, finalizer, hint*);
//                bytelen = pxbuf.ByteLength();
//                pxdata = pxbuf.Data();
//            }
//            else if (args[1].IsBuffer())
//            {
//                Napi::Buffer pxbuf = args[1].As<Napi::Buffer>(); //.Data(): 0; //: Napi::TypedArrayOf<uint32_t>::New(args.Env(), NULL, 0); //, finalizer, hint*);
//                bytelen = pxbuf.ByteLength();
//                pxdata = pxbuf.Data();
//            }
//            else return err_napi(args.Env(), "unhandled buf type: %s", NapiArgType(args, 1));
//        NapiBufInfo buf((args.Length() >= 2)? args[1]: args.Env().Undefined());
//        if (buf.data && u32len(buf.bytelen) < pxbuf_len32()) return err_napi(args.Env(), "pxbuf %s quadlen %'d too short, needs to be >= %'d quadbytes", NapiArgType(args, 1), u32len(buf.bytelen), pxbuf_len32());
        auto wker = new Await4syncAsyncWker<>(args.Env(), this, delay_msec); //, buf.data); //run on bkg thread so main thread doesn't block; NOTE: deduction !worky for ptrs/refs; need "auto" here
        Napi::Value retval = wker->def().Promise();
        debug("ret promise");
        return retval;
    }
    NAPI_EXPORT_METHOD(self_t, "await4sync", /*m_ptr->*/await4sync_method);
//#endif //def USING_NAPI
#if 0
    Napi::Value ws3x_pivot_method(const Napi::CallbackInfo &args) //blocking
    {
//        if (args.Length() < 1 || args.Length() > 2 || !NapiBufInfo::IsOK(args[0]) || (args.Length() > 1 && !NapiBufInfo::IsOK(args[1]))) return err_napi(args.Env(), "node buf (TypedArray/ArrayBuffer/Buffer) + px buf (optional TypedArray/ArrayBuffer/Buffer) expected, got %d: %s %s", args.Length(), NapiArgType(args, 0), NapiArgType(args, 1));
        if (args.Length() != 2 || !NapiBufInfo::IsOK(args[0]) || !args[1].IsNumber()) return err_napi(args.Env(), "node buf (TypedArray/ArrayBuffer/Buffer) + buf# (Number) expected, got %d: %s %s", args.Length(), NapiArgType(args, 0), NapiArgType(args, 1));
        NapiBufInfo nodes(args[0]);
        int bufnum = napi2val<int>(args[1]);
        decltype(m_fbloop)::data_t* const pxbuf = &m_fbloop.m_mempx[(bufnum % m_fbloop.m_numbufs) * m_fbloop.pxbuf_len32()]; //circular fifo
//        NapiBufInfo pxbuf((args.Length() >= 1)? args[1]: args.Env().Undefined());
        int univlen = m_fbloop.xtotal() * m_fbloop.m_yres / 3 / 24; //max nodes based on GPU px res
//        debug("#args %d, nodes quadlen %'d, univlen %'d, pxbuf quadlen %'d %svs mine %'d" ENDCOLOR_NOLINE, args.Length(), u32len(nodes.bytelen), univlen, u32len(pxbuf.bytelen), (u32len(pxbuf.bytelen) == m_fbloop.pxbuf_len32())? GREEN_MSG: YELLOW_MSG, pxbuf_len32());
        debug("#args %d, nodes quadlen %'d, univlen %'d, pxbuf# %'d/%'d" ENDCOLOR_NOLINE, args.Length(), u32len(nodes.bytelen), univlen, bufnum, m_fbloop.m_numbufs);
        if (u32len(nodes.bytelen) < decltype(m_fbloop)::NUM_PORTS * univlen) return err_napi(args.Env(), "nodes1D %s quadlen %'d too short, needs to be >= %'d quadbytes", NapiArgType(args, 0), u32len(nodes.bytelen), decltype(m_fbloop)::NUM_PORTS * univlen);
//        if (args.Length() >= 1 && u32len(pxbuf.bytelen) < pxbuf_len32()) return err_napi(args.Env(), "pxbuf %s quadlen %'d too short, needs to be >= %'d quadbytes", NapiArgType(args, 1), u32len(pxbuf.bytelen), pxbuf_len32());
        m_fbloop.ws3x_pivot(reinterpret_cast<const uint32_t*>(nodes.data), bufnum); //pxbuf.data? reinterpret_cast<uint32_t*>(pxbuf.data): m_pxbuf, u32len(nodes.bytelen));
        return args.Env().Undefined();
    }
    NAPI_EXPORT_METHOD(self_t, "ws3x_pivot", ws3x_pivot_method);
#endif //0
//#ifdef USING_NAPI
//allow JS to use my elapsed/epoch:
//allows consistent time base between JS and C++
    Napi::Value elapsed_method(const Napi::CallbackInfo& info)
    {
        if ((info.Length() > 1) || (info.Length() && !info[0].IsNumber())) return err_napi(info.Env(), "1 optional number (msec) expected; got %d %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()));
        using elapsed_t = decltype(epoch)::elapsed_t;
        elapsed_t time_base = info.Length()? napi2val<elapsed_t>(info[0]): 0; //msec
        elapsed_t retval = /*(double)*/epoch.elapsed() - time_base; //msec
        return Napi::Number::New(info.Env(), retval);
    }
    NAPI_EXPORT_METHOD(self_t, "elapsed", elapsed_method);
//run upd loop on bkg thread:
    template<typename RETVAL_T = int32_t, /*typename ARYVAL_T = uint32_t,*/ class SUPER = Napi::AsyncWorker>
    class BkgloopAsyncWker: public SUPER
    {
        self_t* m_ptr;
        Napi::Promise::Deferred m_deferred;
        int m_numbufs, m_duration;
        uint32_t m_portmask;
//        FBloop::loop_status_t* m_status; //ARYVAL_T* m_data;
        FBloop::wsnode_t* m_nodes;
        RETVAL_T m_retval; //data type ret from non-JS to JS, *not* wker to caller
    public:
        BkgloopAsyncWker(const Napi::Env& env, self_t* ptr, /*FBloop::loop_status_t* status,*/ FBloop::wsnode_t* nodes, int numbufs, uint32_t portmask, int duration): SUPER(env), m_ptr(ptr), /*m_status(status),*/ m_nodes(nodes), m_numbufs(numbufs), m_portmask(portmask), m_duration(duration), m_deferred(Napi::Promise::Deferred::New(env)) { this->Queue(); } //debug("wker ctor"); }
        ~BkgloopAsyncWker() { } //debug("wker dtor"); }
    public:
        Napi::Promise::Deferred& def() /*const*/ { return m_deferred; }
        void Execute() //runs inside wker thread; CAUTION: cannot access JS
        {
            debug("bkg loop wker start"); //data xfr? %d", !!m_data);
            m_retval = -epoch.elapsed();
            m_ptr->m_fbloop.bkgloop(m_nodes, m_numbufs, m_portmask, m_duration); //memory stats will give perf info; just measure total time spent as a sanity check
            m_retval += epoch.elapsed();
            debug("bkg loop wker done after %'d msec", m_retval); //(memcpy %'d took %'d)", elapsed_msec, m_ptr->pxbuf_len32(), busy);
        }
        void OnOK() //runs inside main evt loop; safe to use JS data
        {
//            debug("wker on ok");
            m_deferred.Resolve(Napi::Number::New(this->Env(), m_retval)); //ret error# or #frames waited to caller
//TODO: unref
        }
        void OnError(Napi::Error const& error) { debug("wker on err"); m_deferred.Reject(error.Value()); }
    };
    Napi::Value abkgloop_method(const Napi::CallbackInfo &args) //async !blocks main thread
    {
//        if (args.Length() > 2 || (args.Length() && !args[0].IsNumber()) || (args.Length() > 1 && !NapiBufInfo::IsOK(args[1]))) return err_napi(args.Env(), "delay_msec (optional Number) + px buf (optional TypedArray/ArrayBuffer/Buffer) expected, got %d: %s %s", args.Length(), NapiArgType(args, 0), NapiArgType(args, 1));
        if (args.Length() != 3 || !NapiBufInfo::IsOK(args[0]) || !args[1].IsNumber() || !args[2].IsNumber()) return err_napi(args.Env(), "nodebufs  (TypedArray/ArrayBuffer/Buffer) + duration msec (Number) + port mask (Number) expected, got %d: %s %s %s", args.Length(), NapiArgType(args, 0),  NapiArgType(args, 1), NapiArgType(args, 2));
//        Napi::Buffer<uint32_t> status = ) >= 2) && args[1].IsBuffer())? args[1].As<Napi::Buffer<uint32_t>>(): Napi::Buffer<uint32_t>::New(args.Env(), NULL, 0); //, finalizer, hint*);
        NapiBufInfo nodes(args[0]); //, nodes(args[1]);
        int duration_msec = napi2val<int>(args[1]);
        int port_mask = napi2val<uint>(args[2]);
        int num_ports = 0; //used to determine actual #frbufs within frbuf array
        for (int i = port_mask; i; i >>= 1) if (i & 1) ++num_ports;
//        if (status.bytelen < sizeof(FBloop::loop_status_t)) return err_napi(args.Env(), "status %s %'d too short: %d, needs to be >= %'d quadbytes", NapiArgType(args, 0), u32len(status.bytelen), sizeof(FBloop::loop_status_t));
        if (nodes.bytelen < u32len(m_fbloop.m_univlen * num_ports)) return err_napi(args.Env(), "nodes %s %'d too short: %d, needs to be >= %'d quadbytes", NapiArgType(args, 0), u32len(nodes.bytelen), m_fbloop.m_univlen * num_ports);
        int numbufs = u32len(nodes.bytelen) / m_fbloop.m_univ_padlen / num_ports; //CAUTION: caller uses L2 padded len
        CONSTDEF(MIN_DUR, (int)1e3);
        CONSTDEF(MAX_DUR, 60 * (int)60e3); //1 hr
        if (duration_msec < MIN_DUR || duration_msec > MAX_DUR) /*return err_napi(args.Env(),*/ debug("duration %'d msec (%'d min) out of suggested range %'d..%'d (%'d minutes)", duration_msec, duration_msec / (int)60e3, MIN_DUR, MAX_DUR, MAX_DUR / (int)60e3);
        debug("abkgloop: nodebuf bytelen %'d, univlen %'d (%'d padded) => #port bufs %'d, port mask 0x%x, #ports %d => #frbufs %'d, duration %'d (from caller), %'d (from bufs) msec", nodes.bytelen, m_fbloop.m_univlen, m_fbloop.m_univ_padlen, numbufs * num_ports, port_mask, num_ports, numbufs, duration_msec, divup((numbufs - 1) * m_fbloop.frtime_usec(), (int)1e3));
//TODO        Napi::ObjectReference retval = Napi::ObjectReference::New(retary, 1); //TODO: when to unref?
        auto wker = new BkgloopAsyncWker<>(args.Env(), this, /*(FBloop::loop_status_t*)status.data,*/ (FBloop::wsnode_t*)nodes.data, numbufs, port_mask, duration_msec); //, buf.data); //run on bkg thread so main thread doesn't block; NOTE: deduction !worky for ptrs/refs; need "auto" here
        Napi::Value retval = wker->def().Promise();
        debug("ret promise");
        return retval;
    }
    NAPI_EXPORT_METHOD(self_t, "abkgloop", /*m_ptr->*/abkgloop_method);
    Napi::Value addr_method(const Napi::CallbackInfo &args) //help debug (shared) array buffers
    {
        if (args.Length() != 1 || !NapiBufInfo::IsOK(args[0])) return err_napi(args.Env(), "ary  (TypedArray/ArrayBuffer/Buffer) expected, got %d: %s", args.Length(), NapiArgType(args, 0));
        NapiBufInfo buf(args[0]);
        return Napi::Number::New(args.Env(), (uint64_t)buf.data);
    }
    NAPI_EXPORT_METHOD(self_t, "addr", /*m_ptr->*/addr_method);
#endif //def USING_NAPI
    NAPI_STOP_EXPORTS(self_t); //public
public: //ctors/dtors
//ctor helpers:
//TODO: pull in named args shim
//shim for ctor optional args:
#if 0
    struct opts_t
    {
        decltype(m_fbloop.m_fbnum) fbnum;
//        decltype(m_xres) xres;
//        decltype(m_xblank) xblank;
//        decltype(m_yres) yres;
//        decltype(m_linelen) linelen;
//        decltype(m_ppb) ppb;
//        decltype(m_brlimit[0]) brlimit;
        std::remove_cvref<decltype(m_fbloop.m_brlimit[0])>::type brlimit;
        int debug_level;
//ctor/dtor:
        opts_t(): fbnum(0), /*xres(0), xblank(1), yres(0), linelen(0), ppb(3),*/ brlimit(3 * 256 * 5/6), debug_level(-1) {}
//        opts_t(int want_fbnum = -1, const char* str = 0, int want_debug = 0): fbnum(want_fbnum), timing_ovr(ifnull(str)), debug_level(want_debug) {}; //CAUTION: don't init str to NULL; use ""
    };
#endif
    using opts_t = FBloop::opts_t;
//    utils(struct opts_t& opts): YALP(opts.fbnum, opts.timing_ovr.c_str(), opts.debug_level) {}
//    utils() { debug("utils@ %#p ctor", this); }
//    ~utils() { debug("utils@ %#p dtor", this); }
    FB() = delete; //don't allow implicit create
//    template <typename ... ARGS>
//    utils(Napi::Env env) //, ARGS&& ... args) //: m_shmptr(std::forward<ARGS>(args) ...) //, fremit(env) //perfect fwd; explicitly call ctor to init
    FB(opts_t& opts): m_fbloop(opts) //, SUPER(opts.fbnum) //, m_ppb(opts.ppb)
    {
        debug("FB ctor@ %p", this);
//        if (opts.fbnum != m_fbloop().m_fbnum) m_fbloop() = FBloop(opts);
//        m_fbloop(opts);
//        m_frtime_usec = frtime_usec(); //save value to avoid re-calculating each frame
//        m_fbnum = opts.fbnum;
//        char fbname[30];
//        sprintf(fbname, "/dev/fb%d", m_fbnum);
//        m_fd = ::open(fbname, O_RDWR);
//#pragma message(YELLOW_MSG "TODO: use ioctl and shell to read this stuff in here" ENDCOLOR_NOLINE)
//        m_xres = opts.xres;
//        m_xblank = opts.xblank; //1; //default to 1/3 trailing low
//        m_yres = opts.yres;
//        /*m_yblank =*/
//        m_linelen = opts.linelen; //caller must supply these; config-dependent
//        m_ppb = opts.ppb; //3; //default to SPI 3x encoding
//        if (!m_ppb || xtotal() % m_ppb) warn("xtotal %d !multiple of ppb %d", xtotal(), m_ppb);
//        int vblank_usec = m_pixclock * xtotal() / 1e3 * m_yblank / 1e3; //psec -> usec; kludge: split up 1e6 factor to prevent overflow
//        if (vblank_usec < 50) warn("vblank too short: %d usec", vblank_usec);
//        for (int i = 0; i < SIZEOF(m_brlimit); ++i) m_brlimit[i] = opts.brlimit; //3 * 256 * 5/6; //default to 85% brightness
    }
    ~FB() { debug("FB dtor@ %p", this); }
#ifdef USING_NAPI
//ctor with JS args:
//    Napi::Array frbufs_js;
    FB(const Napi::CallbackInfo& args): FB(/*info.Env(),*/ opts_napi(args)) //, fremit(info.Env())
    {
//static properties that won't change don't need getters:
        Napi::Object me = args.This().As<Napi::Object>();
//        me.Set("NUM_PORTS", (int)NUM_PORTS);
        me.DefineProperties(
        {
#if 1
//these props won't change values, so just create read-only properties instead of getters (less overhead?):
//            exports.Set("version", Napi::String::New(env, TOSTR(VERSION))); //from node.gyp
//            exports.Set("built", Napi::String::New(env, TOSTR(BUILT))); //from node.gyp  __TIMESTAMP__)); //from gcc
            Napi::PropertyDescriptor::Value("MAX_PORTS", Napi::Number::New(args.Env(), (int)m_fbloop.MAX_PORTS), napi_enumerable),
            Napi::PropertyDescriptor::Value("PORT_MASK", Napi::Number::New(args.Env(), (int)m_fbloop.PORT_MASK), napi_enumerable),
            Napi::PropertyDescriptor::Value("UNIV_LEN", Napi::Number::New(args.Env(), m_fbloop.m_univlen), napi_enumerable),
            Napi::PropertyDescriptor::Value("UNIV_PADLEN", Napi::Number::New(args.Env(), m_fbloop.m_univ_padlen), napi_enumerable),
            Napi::PropertyDescriptor::Value("fbnum", Napi::Number::New(args.Env(), m_fbloop.m_fbnum), napi_enumerable),
            Napi::PropertyDescriptor::Value("xres", Napi::Number::New(args.Env(), m_fbloop.m_xres), napi_enumerable),
            Napi::PropertyDescriptor::Value("xblank", Napi::Number::New(args.Env(), m_fbloop.m_xblank), napi_enumerable),
            Napi::PropertyDescriptor::Value("yres", Napi::Number::New(args.Env(), m_fbloop.m_yres), napi_enumerable),
            Napi::PropertyDescriptor::Value("yblank", Napi::Number::New(args.Env(), m_fbloop.m_yblank), napi_enumerable),
            Napi::PropertyDescriptor::Value("stride32", Napi::Number::New(args.Env(), m_fbloop.m_stride32), napi_enumerable),
            Napi::PropertyDescriptor::Value("pixclock_psec", Napi::Number::New(args.Env(), m_fbloop.m_pixclock), napi_enumerable),
            Napi::PropertyDescriptor::Value("frtime_usec", Napi::Number::New(args.Env(), m_fbloop.frtime_usec()), napi_enumerable),
            Napi::PropertyDescriptor::Value("vblank_usec", Napi::Number::New(args.Env(), m_fbloop.vblank_usec()), napi_enumerable),
            Napi::PropertyDescriptor::Value("FPS", Napi::Number::New(args.Env(), m_fbloop.fps()), napi_enumerable),
            Napi::PropertyDescriptor::Value("order", Napi::String::New(args.Env(), m_fbloop.m_order), napi_enumerable),
//stats (rd/wr):
//            Napi::PropertyDescriptor::Value("numrd", Napi::String::New(args.Env(), m_fbloop.m_order), napi_enumerable),
#endif
//https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
//https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
//            Napi::PropertyDescriptor::Value("brlimit", brlimit_getter(args), napi_enumerable), //TODO: when to unref?
//            Napi::PropertyDescriptor::Value("stats", stats_getter(args), napi_enumerable), //TODO: when to unref?
            Napi::PropertyDescriptor::Value("statsdir", Napi::String::New(args.Env(), m_fbloop.m_statsdir), napi_enumerable),
//    wsnode_t* m_wsnodes;
//    data_t* m_mempx;
//            Napi::PropertyDescriptor::Value("pxbuf", pxbuf_getter(args), napi_enumerable), //TODO: when to unref?
//            Napi::PropertyDescriptor::Value("brlimit", 
//                Napi::TypedArrayOf<std::remove_cvref<decltype(m_brlimit[0])>::type /*int32_t*/>::New(args.Env(), SIZEOF(m_brlimit), 
//                    Napi::ArrayBuffer::New(args.Env(), &m_brlimit[0], sizeof(m_brlimit)), 0, napi_int32_array),
//                napi_enumerable), //TODO: when to unref?
//            Napi::PropertyDescriptor::Value("pxbuf", 
//                Napi::TypedArrayOf<std::remove_cvref<decltype(m_pxbuf[0])>::type /*int32_t*/>::New(args.Env(), pxbuf_len32(), 
//                    Napi::ArrayBuffer::New(args.Env(), &m_pxbuf[0], pxbuf_len32() * sizeof(m_pxbuf[0])), 0, napi_uint32_array),
//                napi_enumerable), //TODO: when to unref?
//            Napi::PropertyDescriptor::Function(args.Env(), "wait4sync", wait4sync_method),
//            Napi::PropertyDescriptor::Function(args.Env(), "await4sync", await4sync_method),
        });
//        me.Set("brlimit", /*Napi::Persistent*/(/*m_ptr->*/brlimit_getter(args))); //TODO: when to unref?
//        me.Set("pxbuf", /*Napi::Persistent*/(/*m_ptr->*/pxbuf_getter(args))); //TODO: when to unref?
    }
    static opts_t& opts_napi(const Napi::CallbackInfo& args) //must be atatic to use in delegated ctor
    {
//        static opts_t c_opts; //static to allow returning to caller; CAUTION: must re-init each time to prevent sticky opts or cross talk across threads
        static thread_local opts_t c_opts; //static to allow returning to caller; CAUTION: must re-init each time to prevent sticky opts; make thread-local to prevent cross-talk between threads
        new (&c_opts) opts_t; //re-init to prevent sticky defaults
//        c_opts.rdwr = false; //true;
//debug("js ctor: %d args", info.Length());
//        if (!args.Length()) return c_opts;
//        if (args.Length() > 1 || (args.Length() && !args[0].IsObject())) { err_napi(args.Env(), "options (optional Object) expected; got: %d %s", args.Length(), NapiArgType(args, 0)); return c_opts; }
        if (!args.Length() || !args[0].IsObject()) { err_napi(args.Env(), "options (Object) expected; got: %d %s", args.Length(), NapiArgType(args, 0)); return c_opts; }
//https://github.com/nodejs/node-addon-api/blob/master/doc/object.md
//https://stackoverflow.com/questions/57885324/how-to-access-js-object-property-in-node-js-native-addon
//        std::string unknopt;
        const /*auto*/ Napi::Object napi_opts = args[0].As<Napi::Object>(); //.Value();
        Napi::Array names = napi_opts.GetPropertyNames();
        for (int i = 0; i < names.Length(); ++i)
        {
            std::string name = (std::string)names.Get(i).As<Napi::String>(); //.Get(names[i]).As<Napi::String>();
//            const char* cname = napi2val(names.Get(i));
//debug("yalp ctor opt[%d/%d] '%s' %s", i, names.Length(), name.c_str(), NapiType(napi_opts.Get(name))); //names[i])));
            if (!name.compare("fbnum")) c_opts.fbnum =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.fbnum)>(napi_opts.Get(name).As<Napi::Number>());
//            else if (!name.compare("xres")) c_opts.xres =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.fbnum)>(napi_opts.Get(name).As<Napi::Number>());
//            else if (!name.compare("xblank")) c_opts.xblank =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.debug_level)>(napi_opts.Get(name).As<Napi::Number>());
//            else if (!name.compare("yres")) c_opts.yres =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.debug_level)>(napi_opts.Get(name).As<Napi::Number>());
//            else if (!name.compare("linelen")) c_opts.linelen =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.debug_level)>(napi_opts.Get(name).As<Napi::Number>());
//            else if (!name.compare("ppb")) c_opts.ppb =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.debug_level)>(napi_opts.Get(name).As<Napi::Number>());
//            else if (!name.compare("rdwr")) c_opts.rdwr =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.debug_level)>(napi_opts.Get(name).As<Napi::Number>());
//            else if (!name.compare("numbufs")) c_opts.numbufs =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.debug_level)>(napi_opts.Get(name).As<Napi::Number>());
            else if (!name.compare("brlimit")) c_opts.brlimit =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.debug_level)>(napi_opts.Get(name).As<Napi::Number>());
            else if (!name.compare("shmbuf"))
            {
//                struct shdata_t { FBloop::brlimit_t brlimit; FBloop::stats_t stats; } shdata;
                struct shdata_t { FBloop::stats_t stats; FBloop::brlimit_t brlimit; } shdata; //CAUTION: put stats ary first so js caller doesn't need to know about start ofs
                Napi::Value shmarg = napi_opts.Get(name);
//debug("opts.shmbuf %s", NapiType(shmarg));
                static thread_local NapiBufInfo shmdata; //(shmarg); //, nodes(args[1]); //kludge: hold on to shmbuf from JS caller; thread_local to prevent thread cross-talk; napi !support SharedArrayBuffer :(
                new (&shmdata) NapiBufInfo(shmarg, true); //CAUTION: need to hold ref to prevent garbage collect; TODO: when to deref?
//                m_shmdata.NapiBufInfo(shmarg, true); //cre ref to prevent buf from disappearing
//debug("opts.shmbuf ptr %p, len %'d vs. reqd %'d", shmdata.data, shmdata.bytelen, sizeof(shdata_t));
                if (shmdata.bytelen < sizeof(shdata_t)) { err_napi(args.Env(), "opts.shmbuf too small: %'d needs to be >= %'d+%'d bytes", shmdata.bytelen, sizeof(shdata.stats), sizeof(shdata.brlimit)); return c_opts; }
//                const Napi::Buffer<uint_fast8_t > &napiBuf0 = info[0].As<Napi::Buffer<uint_fast8_t>>();
//                Napi::Reference<Napi::Buffer<uint_fast8_t>> buf0ref = Napi::Reference<Napi::Buffer<uint_fast8_t>>::New(napiBuf0, 1);
//                Napi::ObjectReference retval = Napi::ObjectReference::New(args[0], 1); //TODO: when to unref?
//                return retval.Value(); //retary;
                c_opts.stats_ptr = &((shdata_t*)shmdata.data)->stats;
                c_opts.brlimit_ptr = &((shdata_t*)shmdata.data)->brlimit;
//debug("brlimit@ %p, stats@ %p", c_opts.brlimit_ptr, c_opts.stats_ptr);
            }
            else if (!name.compare("debug")) c_opts.debug_level =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.debug_level)>(napi_opts.Get(name).As<Napi::Number>());
//            else unknopt += strprintf(", %s '%s'", NapiType(napi_opts.Get(name)), name.c_str());
            else warn("unknown option: %s '%s' (valid options: %s)", NapiType(napi_opts.Get(name)), name.c_str(), "fbnum, shmbuf, brlimit, debug");
        }
//        if (unknopt.length()) { err_napi(info.Env(), "unknown option%s: %s (allowed are: %s)", strchr(unknopt.c_str() + 2, ',')? "s": "", unknopt.c_str() + 2, "fbnum, timing, debug"); return c_opts; }
debug("FB ctor opts: fbnum %d, rd/wr? %d, brlimit %'d, debug %d", c_opts.fbnum, true, c_opts.brlimit, c_opts.debug_level);
        return c_opts;
    }
#endif //def USING_NAPI
#if 0
//helpers:
private:
//    uint32_t numwr, numfr;
    void bkgloop()
    {
        for (;;)
        {
            if (atomic(numwr) == NUM_PORTS)
            {
                now = Date.now();
                jobctl.upd_count_bump;
                jobctl.upd_idle_bump = upd_ready + now; upd_ready = -now;
                if (jobctl.numcycle_bump+1 > 3) jobctl.numcycle = EOF; //_bump; //Atomics.add(shmbuf, 2, 1); //#cycles
                pivot(frtime);
                now = Date.now();
                jobctl.upd_pivot_bump = upd_ready + now; upd_ready = -now;
                jobctl.numrd = 0; //Atomics.store(shmbuf, 0, 0); //wipe out excess
                await sync(frtime);
                now = Date.now();
                jobctl.upd_sync_bump = upd_ready + now; upd_ready = -now;
                jobctl.numwr_bump = -6; //drop; //Atomics.add(shmbuf, 1, -6); //only remove jobs from completed cycle, preserve pre-completed work on next cycle
                debug("allow next cycle".brightCyan); //"#wr bump back, new val:", shmbuf.numwr); //Atomics.load(shmbuf, 1));
            }
            wait4sync();
            pivot()
        }
    }
    int pivot_count = 0;
    void ws3x_pivot(const uint32_t* nodes1D, uint32_t* pxbuf, int num_nodes)
    {
        int UNIV_LEN = num_nodes / NUM_PORTS, gaplen = m_stride32 - xtotal();
        decltype(epoch)::elapsed_t started = -epoch.elapsed();
//        debug("TODO: pivot %p -> %p", nodes2D, pxbuf);
//#pragma message(YELLOW_MSG "TODO: pivot" ENDCOLOR_NOLINE)
        uint32_t* bp = &pxbuf[0]; //rewind
        uint32_t* eol = bp + xtotal(); //set first gap
        debug("ws3x_pivot: nodes1D %p, pxbuf %p %svs. mine %p%s, UNIV_LEN %'d, NUM_PORTS %d, gaplen %d", nodes1D, pxbuf, (pxbuf == m_pxbuf)? GREEN_MSG: YELLOW_MSG, m_pxbuf, ENDCOLOR_NOLINE, UNIV_LEN, NUM_PORTS, gaplen);
        for (int node = 0; node < UNIV_LEN; ++node)
        {
            uint32_t cached[NUM_PORTS];
            for (int port = 0; port < NUM_PORTS; ++port) cached[port] = limit(nodes1D[port * UNIV_LEN + node], m_brlimit[port]); //limit brightness + localize memory access for bit loop
            for (uint32_t pxbit = 0x800000; pxbit; pxbit >>= 1)
            {
                *bp++ = -1; //start of bit
                uint32_t pxbits = 0xff000000;
                for (uint32_t port = 0, portbit = 1 << (NUM_PORTS - 1); port < NUM_PORTS; ++port, portbit >>= 1)
                    if (cached[port] & pxbit) pxbits |= portbit;
                *bp++ = pxbits; //live part of bit
                *bp++ = 0xff000000; //end of bit
                if (bp == eol) eol = xtotal() + (bp += gaplen); //fb gap at end of each raster line
            }
        }
        if (pivot_count++) return;
        started += epoch.elapsed();
        debug("redraw[0] eof: x %'d/%'d, y %'d/%'d, gaplen %d, took %'d msec", (bp - &pxbuf[0]) % xtotal(), m_xres, (bp - &pxbuf[0]) / xtotal(), m_yres, gaplen, started);
    }
    inline static wsnode_t limit(wsnode_t color, int LIMIT3)
    {
        if (!LIMIT3) return color;
        int r = R(color), g = G(color), b = B(color);
        int br = r + g + b; //brightness(color);
        if (br <= LIMIT3/*_BRIGHTNESS * 3*/) return color; //TODO: maybe always do it? (to keep relative brightness correct)
//TODO: cache results?
//NOTE: palette-based nodes would make this more efficient
//    return toARGB(A(color), r, g, b);
//linear calculation is more efficient but less accurate than HSV conversion+adjust:
        int dimr = r * LIMIT3/*_BRIGHTNESS * 3*/ / br;
        int dimg = g * LIMIT3/*_BRIGHTNESS * 3*/ / br;
        int dimb = b * LIMIT3/*_BRIGHTNESS * 3*/ / br;
//debug("r %d * %d / %d => %d, g %d * %d / %d => %d, b %d * %d / %d => %d", r, 3 * LIMIT_BRIGHTNESS, br, dimr, g, 3 * LIMIT_BRIGHTNESS, br, dimg, b, 3 * LIMIT_BRIGHTNESS, br, dimb);
        return Abits(color) | (dimr << 16) | (dimg << 8) | (dimb << 0); //LIMIT3 / br < 1; don't need clamp()
    }
#endif //0
};
NAPI_EXPORT_CLASS(FB);
//NAPI_EXPORT_CLASS(YALP_shm, "YALP");


//NODE_API_MODULE(clock, Init)
NAPI_EXPORT_MODULES(); //export modules to Javascript

#define _HOIST 99
#endif //def NEW_YALP


#if 0 //ndef _HOIST //tsfn test
#include <chrono>
#include <napi.h>
#include <thread>
#include <functional>

using namespace Napi;

class wrapper
{
public:
using Context = Reference<Value>;
using DataType = int;
// Transform native data into JS data, passing it to the provided
// `callback` -- the TSFN's JavaScript function.
static void CallJs(Napi::Env env, Function callback, Context *context, DataType *data) {
  // Is the JavaScript environment still available to call into, eg. the TSFN is
  // not aborted
printf("calljs_dummy\n");
  if (env != nullptr) {
    // On N-API 5+, the `callback` parameter is optional; however, this example
    // does ensure a callback is provided.
    if (callback != nullptr) {
      callback.Call(context->Value(), {Number::New(env, *data)});
    }
  }
//  if (data != nullptr) {
//    // We're finished with the data.
//    delete data;
//  }
}
using TSFN = TypedThreadSafeFunction<Context, DataType, CallJs>;
using FinalizerDataType = void;
static std::thread nativeThread;
static TSFN tsfn;

static Value Start(const CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2) 
    throw TypeError::New(env, "Expected two arguments");
  if (!info[0].IsFunction()) 
    throw TypeError::New(env, "Expected first arg to be function");
  if (!info[1].IsNumber()) 
    throw TypeError::New(env, "Expected second arg to be number");
  int count = info[1].As<Number>().Int32Value();
#if 0
using Context = Reference<Value>;
using DataType = int;
//NOTE: globals + static vars can be used without capture
//    void CallJs(Napi::Env env, Function callback, Context *context, DataType *data);
//    std::function<void(Napi::Env, Function, Context*, DataType*)> 
//https://www.nextptr.com/tutorial/ta1188594113/passing-cplusplus-captureless-lambda-as-function-pointer-to-c-api
//NOTE: globals captured automatically
    auto CallJs = [] (Napi::Env env, Function callback, Context *context, DataType *data)
    {
printf("calljs lambda\n");
        if (env != nullptr && callback != nullptr) callback.Call(context->Value(), {Number::New(env, *data)});
        if (data != nullptr) delete data;
    };

using TSFN = TypedThreadSafeFunction<Context, DataType, CallJs>;
using FinalizerDataType = void;
    static std::thread nativeThread; //NOTE: can't be on stack; join() called after func returns
    static TSFN tsfn; //NOTE: can't be on stack; needs to live past func return
#endif

// Create a new context set to the the receiver (ie, `this`) of the function call
  Context *context = new Reference<Value>(Persistent(info.This()));
// Create a ThreadSafeFunction
  tsfn = TSFN::New(
      env,
      info[0].As<Function>(), // JavaScript function called asynchronously
      "Resource Name",        // Name
      0,                      // Unlimited queue
      1,                      // Only one thread will use this initially
      context,
      [&nativeThread](Napi::Env, FinalizerDataType *, Context *ctx) { nativeThread.join(); delete ctx; } // Finalizer used to clean threads up
  );
  nativeThread = std::thread([count, &tsfn]
  {
    for (int i = 0; i < count; i++)
    {
//      int *value = new int(clock());
      int value = clock();
      napi_status status = tsfn.BlockingCall(&value);
      if (status != napi_ok) { printf("blk call failed\n"); break; } // Handle error
      std::this_thread::sleep_for(std::chrono::seconds(1));
    }
    tsfn.Release();
  });
  return Boolean::New(env, true);
}
};
decltype(wrapper::nativeThread) wrapper::nativeThread;
decltype(wrapper::tsfn) wrapper::tsfn;

Napi::Object Init(Napi::Env env, Object exports)
{
  exports.Set("start", Function::New(env, wrapper::Start));
  return exports;
}

NODE_API_MODULE(clock, Init)
#define _HOIST 99
#endif


//kludge: use CPP to hoist dependents; allows top-down coding but avoids need for fwd refs
#ifndef _HOIST
 #define HOIST_UTILS  1
 #define HOIST_HELPERS  2
 #define HOIST_DATASTTR  3
#define _HOIST  HOIST_DATASTTR
#include __FILE__  //error here requires CD into folder or add "-I." to compile
///////////////////////////////////////////////////////////////////////////////
////
/// top level defs + exported objects (simplified api)
//

//main api object (class):
//this object lives in shm (as singleton)
//CAUTION: need to ipcrm if sttr contents change
//wrapper for shm + function to update FB (dedicated bkg thread)
#include <unistd.h> //close(), getpid(), usleep()
#include <string.h> //strchr(), strstr()
#include <fcntl.h> //O_RDONLY
#include <stdio.h> //read()
#include <utility> //std::declval<>
#include <type_traits> //std::remove_reference<>
#include <stdexcept> //std::runtime_error(), std::out_of_range()
class YALP: public shmdata_t
{
    using SUPER = shmdata_t;
    using self_t = YALP;
    CONSTDEF(NULLBITS, 1); //kludge: GPIO seems to need a few usec to fulfill before sending data?
    CONSTDEF(PPB, 3); //enum { PPB = 3 };
//    /*struct*/ shmdata_t m_shdata; //data shared between all instances (across threads + procs)
//public: //types + defs
//    using shmdata_t = typename decltype(m_shdata);
//    using frbuf_t = typename /*decltype(m_shdata)*/ shmdata_t::frbuf_t;
//    using port_t = typename /*decltype(m_shdata)*/ shmdata_t::frbuf_t::port_t;
//    using wsnode_t = typename /*decltype(m_shdata)*/ shmdata_t::frbuf_t::port_t::wsnode_t;
//    using gpubits_t = typename scrinfo_t::gpubits_t;
//    CONSTDEF(NUMPORTS, shmdata_t::NUMPORTS);
//    CONSTDEF(NUMBUFS, shmdata_t::NUMBUFS);
//    using gpubits_t = uint32_t; //1 bit for each "port"; only 24 bits available in RGB value
//    static_assert(NUMPORTS <= bytes2bits(sizeof(gpubits_t)));
    int m_shminit = 1; //track shm init; CAUTION: must be !0 to detect shm init
public: //ctor/dtor
    YALP() = delete; //don't allow implicit create (requires at least fb# to be meaningful) //: YALP(-1) {};
    YALP(int fbnum = -1, const char* timing_ovr = 0, int want_debug = 0): shmdata_t(choosefb(fbnum, timing_ovr), timing_details(timing_ovr), want_debug, NULLBITS * PPB) //, m_pxbuf(/*m_shdata.*/fbnum) //, gaplen(m_shdata.xtotal - m_shdata.xres)
    {
//        univlen(NULLBITS * PPB); //CAUTION: need to do this before using univlen()
//need to set these before accessing shmdata_t::wsnodes[]:
//        frbufnodes_t::m_limit = portnodes_t::m_limit = univnodes_t::m_limit = wsnodes_poolmax + NUMBUFS * NUMPORTS * univlen();
//        frbufnodes_t::m_len = NUMBUFS;
//        portnodes_t::m_len = NUMPORTS;
        univnodes_t::m_len = univlen();
//debug("yalp ctor op fb#%d", this->fbnum); //CAUTION: use shmdata copy > choose, not caller's < choose
//        AutoFB pxbuf(this->fbnum); //, AutoFB<>::NO_MMAP);
        AutoFB<>::timing_t timing(xres, xtotal, yres, ytotal, pxclock, false, false);
        AutoFB pxbuf(this->fbnum, timing); //*this); //{xres, xtotal, yres, ytotal, pxclock}
        if (!pxbuf.isOpen()) fatal("open fb#%d failed", this->fbnum);
//        univlen_check();
        if (pxbuf.width() != /*m_shdata.*/xtotal) warn("raster stride32 %'lu != xtotal res %'d", pxbuf.width(), /*m_shdata.*/xtotal);
        if (/*m_shdata.*/ppb() != PPB) fatal("%d ppb !implemented; should be %d", /*m_shdata.*/ppb(), PPB);
//        if (gaplen() != 1) fatal("gap len %d !implemented; should be 1 with ppb %d", gaplen, PPB);
        debug("YALP ctor @%p: fb# %d, #bufs %d, #ports %d, pid %d/thread# %d", this, /*m_shdata.*/ this->fbnum, /*shmdata_t::*/NUMBUFS, NUMPORTS, getpid(), thrinx());
        timer_check(); //checks if time tracking will be accurate
        memperf_check(); //check if shorter node buf packing is worth it
    }
    ~YALP()
    {
        debug("YALP dtor @%p: shdata @%p, pid %d/thread# %d", this, &SUPER::debug_level, getpid(), thrinx());
    }
//ctor helpers:
//TODO: pull in named args shim
//shim for ctor optional args:
    struct opts_t
    {
//        decltype(m_shdata.htotal) htotal;
//        decltype(m_shdata.vres) vres;
//        decltype(m_shdata.pxclk) pxclk;
        int fbnum;
        std::string timing_ovr; //const char* timing_override;
        int debug_level;
//ctor/dtor:
//        opts_t(): fbnum(-1), timing_override(0), debug_level(0) {}
        opts_t(int want_fbnum = -1, const char* str = 0, int want_debug = 0): fbnum(want_fbnum), timing_ovr(ifnull(str)), debug_level(want_debug) {}; //CAUTION: don't init str to NULL; use ""
    };
    YALP(struct opts_t& opts): YALP(opts.fbnum, opts.timing_ovr.c_str(), opts.debug_level) {}
//try to find a valid framebuffer:
    static int choosefb(int fbnum, const char* timing_ovr)
    {
        if (fbnum != -1) return fbnum; //already chosen by caller
//start at highest (assumes dpi > hdmi/console)
        CONSTDEF(MAX_FB, 4);
        for (fbnum = 0; fbnum < MAX_FB; ++fbnum)
        {
            AutoFB fb(flip(fbnum, MAX_FB)); //, AutoFB<>::NO_MMAP);
            if (!fb.isOpen()) continue; //silently ignore non-existent devices
            warn("no FB# specified; using FB device# %d", fb.fbnum());
            return fb.fbnum();
        }
        fatal("can't find suitable FB device"); //can't find suitable FB device
    }
//get timing details from config if caller !specified:
    static const char* timing_details(const char* timing_ovr)
    {
//        DebugScope ds("CFG::timing");
        if (timing_ovr && timing_ovr[0]) return timing_ovr;
        if (!isRPi) return 0;
//try to get detailed timing (RPi only):
        static std::string str;
        str = shell("vcgencmd hdmi_timings");
        if (str.size()) return str.c_str();
        str = shell("vcgencmd get_config dpi_timings");
        if (str.size()) return str.c_str();
        return 0;
    }
public: //gpu loop methods
//    bool start();
    bool cancel() { return cancel(stats.last_updloop); }
    /*m_shdata::numfr_t*/ bool cancel(int result) //= stats.last_updloop)
    {
        bool was_running = /*m_shdata.*/bkgpid;
//debug(RED_MSG "cancel updloop on bkgpid %d, was running? %d, result %'d", bkgpid.load(), was_running, result);
        /*m_shdata.*/bkgpid = 0;
        stats.last_updloop = result;
        return was_running; //m_shdata.stats.numfr;
    }
//private: //helpers:
//pivot+update loop:
//NOTE: must not be run on main thread! (due to blocking)
    using numfr_t = decltype(stats)::numfr_t;
//    using evth_t = decltype(void emitfr(frbuf_t* fbptr));
//    typedef void (*evth_t)(frbuf_t* fbptr);
    template <typename EVTH_T> //, typename ... ARGS> //kludge: use template to allow lambda or member func
    numfr_t updloop(/*ARGS&& ... args,*/ EVTH_T&& emitfr)
    {
//debug("here1");
        numfr_t didfr = /*SUPER::*/stats.numfr;
debug("updloop start: bkg already? %d, pid %d, status '%c', frbufs %d: %d/%'d, %d/%'d, %d/%'d, %d/%'d", isRunning(), bkgpid.load(), proc_status(bkgpid), fifo.load(), fbptr(0)->seqnum.load(), fbptr(0)->timestamp(), fbptr(1)->seqnum.load(), fbptr(1)->timestamp(), fbptr(2)->seqnum.load(), fbptr(2)->timestamp(), fbptr(3)->seqnum.load(), fbptr(3)->timestamp());
        while (isRunning()) usleep(10e3); //poll until other instance completes; TODO: use mutex/cond_var/signal?
        if (stats.numfr == didfr) //bkg job !running; start new loop
        {
            bkgpid = getpid(); //sets isRunning = true
//          { //extra scope to close FB < final emit
            AutoFB<>::timing_t timing(xres, xtotal, yres, ytotal, pxclock, true, true);
            AutoFB pxbuf(fbnum, timing); //*this); //{xres, xtotal, yres, ytotal, pxclock}
            debug(CYAN_MSG "updloop %s: pid %d, fbnum %d open? %d, frbuf# %d frtime %'d", didfr? "resume": "start", bkgpid.load(), fbnum, pxbuf.isOpen(), fifo.load(), oldest()->timestamp());
            if (!didfr) stats.clear(); //fresh start: clear stats
//debug("bkgpid %d, previous numfr %'d", bkgpid.load(), stats.numfr.load());
            timer_t<(int)1e6> perf; //now_usec; elapsed<(int)1e6>(now_usec);
//            AutoClose fb(AutoClfbopen());
//            for (int i = 0; i < m_shdata.numbuf(); ++i) m_shdata.oldest()->recycle(0);
            while (isRunning())
            {
//CONSTDEF(DEBUG_FREQ, 30);
                if (!pxbuf.isOpen()) break; //whoops, something bad happened?
//                { //lock scope
//debug("acq lock");
//                    PROVIDER_LOCKTYPE lock(m_mtx); //NOTE: mutex must be held while var is changed even if atomic, according to https://en.cppreference.com/w/cpp/thread/condition_variable
                auto fbptr = /*m_shdata.*/dequeue(); //get oldest to recycle
//                bool has_previous = (fbptr->frnum != 0);
                /*if (fbptr->dirty)*/ pivot24(pxbuf, fbptr); //, !(stats.numfr /*% DEBUG_FREQ*/)? 50: 0);
//                memset(&wsnodes[fbptr - &frbufs[0]], XPARENT, sizeof(wsnodes[0])); //set all nodes to transparent before reusing frbuf; allows caller to skip redundant updates; CAUTION: assumes all bytes of XPARENT are ==
                frbuf_t* prevptr = fbptr->frnum? &frbufs[(fbptr - &frbufs[-3]) % NUMBUFS]: 0;
if (fbptr->frnum) if (prevptr + 1 != fbptr && prevptr - 3 != fbptr) fatal("bad prevptr@ %p, fbptr@ %p, diff %d", prevptr, fbptr, fbptr - prevptr);
                if (prevptr) //recycle previous frbuf; current frbuf will hold prev values for xparency next time
                {
                    memset<wsnode_t>(&wsnodes[prevptr - &frbufs[0]][0][0], XPARENT, &wsnodes[1][0][0] - &wsnodes[0][0][0]); //NUMPORTS * univlen()); //sizeof(wsnodes[0]) / sizeof(wsnode_t)); //NUMPORTS * univlen()); //sizeof(wsnodes[0]) / sizeof(wsnode_t));
//                fbptr->/*m_shdata.*/recycle();
// /*frbuf_t::timestamp_t*/ elapsed_t svtimest = fbptr->timestamp();
//                    fbptr->timestamp = frtime_msec(frnum(fbptr->timestamp) + NUMBUFS); //avoid cumulative drift by converting via fr#
                    prevptr->frnum += NUMBUFS; //gpu refresh rate likely won't match renderer; convert fr# to timestamp so renderer can compare
                }
                stats.busytime += perf.elapsed();
//if (!(stats.numfr % DEBUG_FREQ)) debug("wr new[%d/%d]: frtime %'d usec, fr#%'d -> %'d, timestamp %'d -> %'d, busy %'d, emit %'d, idle %'d, is running? %d", fbptr - &frbufs[0], NUMBUFS, frtime_usec(), fbptr->frnum - NUMBUFS, fbptr->frnum.load(), fbptr->timestamp(-NUMBUFS), fbptr->timestamp(), stats.busytime.load(), stats.emittime.load(), stats.idletime.load(), bkgpid.load()); //frnum(svtimest), svtimest, fbptr->timestamp.load());
//                    if (fbptr->timestamp == svtimest) fatal("failed to update frbuf[%d/%d] fr# %'d, timest %'d", fbptr - &frbufs[0], NUMBUFS, frnum(fbptr->timestamp), fbptr->timestamp.load());
                if (prevptr)
                {
                    emitfr(/*std::forward<ARGS>(args) ...,*/ prevptr); //no- perfect fwd
                    stats.emittime += perf.elapsed();
                }
//                }
//                VOID m_cv.notify_all(); //wake render/wker threads waiting for more frbufs
//debug("recycle[%d]: seq# %'u => %'u, timest %'u => %'u", i, oldseq, seqnum, oldtime, frbuf.timestamp.load()); //NOTE: need to use .load() for atomics in printf()
                ++/*m_shdata.*/stats.numfr;
//if (!(stats.numfr % DEBUG_FREQ)) debug("updloop: fr# %d", stats.numfr.load());
//                if (!isOpen())
//                if (!wait4sync(fd, m_shdata.frtime)) break;
                pxbuf.wait4sync();
                /*elapsed_t wait_usec =*/ stats.idletime += perf.elapsed(); //elapsed<(int)1e6>(now_usec);
            }
            /*m_shdata.*/bkgpid = 0; //isRunning = false
//            didfr = /*m_shdata.*/ /*SUPER::*/stats.numfr - didfr;
//          } //extra scope to close FB < final emit
            emitfr(/*std::forward<ARGS>(args) ...,*/); //cancelled
//            if (isOpen()) close(fd);
//            { //lock scope
//                PROVIDER_LOCKTYPE lock(m_mtx); //NOTE: mutex must be held while var is changed even if atomic, according to https://en.cppreference.com/w/cpp/thread/condition_variable
//                ++dequeue()->seqnum; //get oldest + mark eof
//            }
//            VOID m_cv.notify_all(); //wake render/wker threads waiting for more frbufs
        }
        didfr = /*m_shdata.*/ /*SUPER::*/stats.numfr - didfr;
debug("updloop exit: bkgpid %d status '%c', %'d frames processed (%'d msec)", bkgpid.load(), proc_status(bkgpid), didfr, frtime_msec(didfr));
        return didfr; //#frames processed
    }
private:
//pivot 24 separate bit planes ("ports") into 24-bit gpu (RGB) values:
//NOTE: (perf) this is hard-coded for WS281X protocol at 3 ppb (2.4MHz); see previous version for variants
//CAUTION: px24 ptr needs to account for imaginary (hblank) pixels because they affect timing
//instead of alloc extra memory for imaginary pixels, just let ptr wrap to next display line and then bump it back to start of line after writing imaginary pixels
// 0..xres..xtotal
// +---------+---+
// |         |iii|
// |III  yres|   |  imaginary pixels written at III, should be at iii but no memory is there
// +---------+   |
// |       ytotal|
// +-------------+
//    using px24_t = typename decltype(m_pxbuf)::data_t;
//    using wsnode_t = std::remove_reference<decltype(frbufs[0].ports[0].wsnodes[0])>::type;
//    using port_t = typename decltype(m_shdata)::port_t;
    CONSTDEF(WSNODE_MSB, 1 << (WSBITS - 1));
    CONSTDEF(WHITE, 0xFFffffff); //ARGB value
    CONSTDEF(BLACK, 0xFF000000); //ARGB value; all RGB bits = 0 + full alpha
    CONSTDEF(DATA_BITS, 0XFF00ffff); //show cyan where data would go (debug only)
    CONSTDEF(HSYNC_GAP, 0XFFff0000); //show red during hsync gap (debug only)
//    static constexpr int bitmasks[] = 
//    {
//        0x800000, 0x400000, 0x200000, 0x100000, 0x80000, 0x40000, 0x20000, 0x10000, //R7..R0
//        0x8000, 0x4000, 0x2000, 0x1000, 0x800, 0x400, 0x200, 0x100, //G7..G0
//        0x80, 0x40, 0x20, 0x10, 8, 4, 2, 1, //B7..B0
//            0 //dummy entry to allow trailing comma above (Javascript-like convenence)
//    };
//#define PORTBIT(p)  (NODEMSB >> ((((p) / 8) * 16) + 8 - (p) - 1))
    static constexpr int flip(int val, int limit) { return limit - val - 1; } //CAUTION: !clamped
    static constexpr gpubits_t PORTBIT(int p) { return WSNODE_MSB >> ((p & ~7) + flip(p & 7, 8)); }
//    AutoFB</*scrinfo_t::*/ gpubits_t> m_pxbuf;
//    const size_t gaplen; //#px during hblank; should be 1
    void pivot24/*_3ppb*/(AutoFB<gpubits_t>& pxbuf, frbuf_t* fbptr, int want_debug = 0)
    {
        using wsnodes2D_t = portnodes_t; //std::remove_reference<decltype(wsnodes[0])>::type;
        wsnodes2D_t& wsnodes2D = wsnodes[fbptr - &frbufs[0]]; //) * NUMPORTS * univlen()]; //wsnodes[fbptr - &frbufs[0]]; //->fifo(this)];
        wsnodes2D_t& previous2D = /*fbptr->frnum?*/ wsnodes[(fbptr - &frbufs[-3]) % NUMBUFS]; //) * NUMPORTS * univlen()]; //[(fbptr - &frbufs[-3]) % NUMBUFS]; //: wsnodes;
        if (&wsnodes2D[0] - &previous2D[0] != 1 * NUMPORTS * univlen() * sizeof(wsnode_t) && &wsnodes2D[0] - &previous2D[0] != -3 * NUMPORTS * univlen() * sizeof(wsnode_t)) fatal("prev nodes@ %p ofs %d bad, nodes@ %p", &previous2D[0], &wsnodes2D[0] - &previous2D[0], &previous2D[0]);
//broken        if (wsnodes2D - previous2D != 1 * NUMPORTS && wsnodes2D - previous2D != -3 * NUMPORTS) fatal("prev nodes@ %p ofs %d %d bad, nodes@ %p", &previous2D[0], wsnodes2D - previous2D, &wsnodes2D[0] - &previous2D[0], &previous2D[0]);
//#pragma message(PINK_MSG "REMOVE THIS")
//usleep(2400); return;
//static int debug2 = 0;
//if (!debug2++) for (int i = 0; i < 32; ++i) debug("portbit[%d] = 0x%x", i, PORTBIT(i));
        timer_t<(int)1e6> perf; //started_usec; elapsed<(int)1e6>(started_usec);
#if 1 //no longer needed with reduced port sttr size?
        unsigned short limits[NUMPORTS]; //, dirtylen[NUMPORTS]; //(perf) localize mem access
        for (int u = 0; u < NUMPORTS; ++u)
        {
//            frbuf_t::port_t* fbp = &fbptr->ports[u];
            if ((limits[u] = ports[u].brlimit) >= 3 * 255) limits[u] = 0; //no limit
//            dirtylen[u] = fbp->dirtylen; //? fbp->first_dirty.load(): (shmdata_t::frbuf_t::port_t::dirtyofs_t)-1; //set past eof if no last (disables stream on that port)
        }
#endif
//        gpubits_t active = WHITE; //BLACK; //NO-must start at  beginning: WS281X data can start at different times for each port; keep a bitmap
        gpubits_t* bp24 = &pxbuf[0][0]; //.pixels();
        gpubits_t* gapptr = &pxbuf[0][xres];
        const int gap_adjust = /*m_shdata.xtotal*/ pxbuf.width() - xres; //xtotal; //px width varies due to O/S FB padding; /*m_shdata.*/xres; //should be 1
bool save_debug = want_debug-- > 0;
//NOTE: xtotal > xres, px width >= xres (os fb could pad to any width)
        if (save_debug) debug("pivot: %d null, xres %'d, px width %'u - xres %'d => gap adjust %'d, univlen %'d, ppb %d, px@ %p, first gap @%p ('%'u)", NULLBITS, xres, pxbuf.width(), xres, gap_adjust, univlen(), PPB, &pxbuf[0][0], gapptr, gapptr - &pxbuf[0][0]); //xtotal
        if (pxbuf.dirty()) fatal("FB still dirty?"); //backlog or timing messed up?
        size_t want_xyofs = (NULLBITS + /*m_shdata.*/univlen() * WSBITS) * PPB;
        int want_y = want_xyofs / xtotal, want_x = want_xyofs % xtotal; //pxbuf.width();
        if (/*want_xyofs*/ want_y * pxbuf.width() + want_x > pxbuf.width() * pxbuf.height()) fatal_type(std::out_of_range, "xy ofs %'d => [y %'d, x %'d] will overshoot eo pxbuf[x %'d, y %'d] = '%'d", want_xyofs, want_y, want_x, pxbuf.width(), pxbuf.height(), pxbuf.width() * pxbuf.height());
        for (int i = 0; i < NULLBITS * PPB; ++i) *bp24++ = BLACK; //NOTE: assumes NULLBITS < rowlen (no address gaps)
        for (int xy = 0; xy < /*m_shdata.*/univlen(); ++xy) //fill L2R, T2B
        {
//pivot next node from each port (plane):
//(perf) localize mem access by loading next block of 24 bits onto stack
            wsnode_t portnodes[NUMPORTS]; //1 node per port
//            for (port_t* fbp = &fbptr->ports[u], ubit = 
            for (int u = 0; u < NUMPORTS; ++u)
            {
//                frbuf_t::port_t* fbp = &fbptr->ports[u];
                wsnode_t color = wsnodes2D[u][xy], svcolor = color;
                portnodes[u] = wsnodes2D[u][xy] = (color != XPARENT)? limit(color, limits[u]): /*has_previous?*/ previous2D[u][xy]; //: BLACK; //enforce reduced brightness here in case client forgets or has bugs; update current frbuf with actual RGB value used so next frame can use transparency
                if (RGBbits(portnodes[u]) && (want_debug-- > 0)) debug("needs pivot: portbits[u %'d][xy %'d] 0x%x xpar? %d, limit %d => 0x%x", u, xy, svcolor, svcolor == XPARENT, limits[u], portnodes[u]);
//                if (xy != dirtylen[u]) continue; //no change in stream state
//                gpubits_t ubit = WSNODE_MSB >> u;
//                active ^= ubit; //start/stop stream for this port
//                if (active & ubit) dirtyofs[u] = fbp->last_dirty; //if stream started, get end ofs
//                if (u && want_debug-- > 0) debug("%s port %d at node ofs %'d", (active & ubit)? "starting": "stopping", u, xy);
            }
            for (gpubits_t ubit = WSNODE_MSB; ubit; ubit >>= 1) //render all gpu data bits
            {
//pivot node bits for each port into GPU px:
//each port represents a different RGB bit (plane)
//CAUTION: a lot of memory accesses here; could slow things down (RPi memory is slow?)
//NOTE: RGB order doesn't matter here; if a ws281x universe (port) is on the wrong GPIO pin, just swap them :P
//current order is: 0..7 = R0..7, 8..15 = G0..7, 16..23 = B0..7 (makes addressing a little simpler in caller)
                gpubits_t px24 = //Abits(::WHITE) | //0xFF000000 |
                    ((portnodes[0] & ubit)? PORTBIT(0): 0) |
                    ((portnodes[1] & ubit)? PORTBIT(1): 0) |
                    ((portnodes[2] & ubit)? PORTBIT(2): 0) |
                    ((portnodes[3] & ubit)? PORTBIT(3): 0) |
                    ((portnodes[4] & ubit)? PORTBIT(4): 0) |
                    ((portnodes[5] & ubit)? PORTBIT(5): 0) |
                    ((portnodes[6] & ubit)? PORTBIT(6): 0) |
                    ((portnodes[7] & ubit)? PORTBIT(7): 0) |

                    ((portnodes[8] & ubit)? PORTBIT(8): 0) |
                    ((portnodes[9] & ubit)? PORTBIT(9): 0) |
                    ((portnodes[10] & ubit)? PORTBIT(10): 0) |
                    ((portnodes[11] & ubit)? PORTBIT(11): 0) |
                    ((portnodes[12] & ubit)? PORTBIT(12): 0) |
                    ((portnodes[13] & ubit)? PORTBIT(13): 0) |
                    ((portnodes[14] & ubit)? PORTBIT(14): 0) |
                    ((portnodes[15] & ubit)? PORTBIT(15): 0) |

                    ((portnodes[16] & ubit)? PORTBIT(16): 0) |
                    ((portnodes[17] & ubit)? PORTBIT(17): 0) |
                    ((portnodes[18] & ubit)? PORTBIT(18): 0) |
                    ((portnodes[19] & ubit)? PORTBIT(19): 0) |
                    ((portnodes[20] & ubit)? PORTBIT(20): 0) |
                    ((portnodes[21] & ubit)? PORTBIT(21): 0) |
                    ((portnodes[22] & ubit)? PORTBIT(22): 0) |
                    ((portnodes[23] & ubit)? PORTBIT(23): 0) |
                    BLACK;
//#if 1 //debug
//            if ((px24ptr < &pixels[0][0]) || (px24ptr >= &pixels[height()][0]))
//                RETURN(errmsg("pivot loop[%'d/%'d] bad: bp24 %px scrv. pixels@ %p..%p", x, m_chqbytes, px24ptr, px24));
//                if (Abits(px24)) fatal("pivot turned on non-RGB bit at node[%'d]: 0x%x", xy, Abits(px24));
//            if (m_debug_pivot && RGBbits(px24)) debug("pivoted qb[%'d]/px[%'d of %'d] = 0x%x doing bit 0x%x", x, px24ptr - &pixels[0][0], &pixels[NUMCH][0]) - &pixels[0][0], px24, bit);
                if (RGBbits(px24) && (want_debug-- > 0)) debug("gpu data[%'d] bit 0x%x = 0x%x", xy, ubit, px24);
//#endif //1
//                px24 |= BLACK; //Abits(WHITE);
//NOTE: each (set of 24) wsnodes genertes 3 * 24 = 72 gpu px, but only need to check every 3rd for wrap
//NOTE: only stop bits should go into gap (data low anyway)
                if (bp24 == gapptr) fatal("start bits[%'d] 0x%x fall into gap@ %p ('%'d); prev gap adjust: bp24@ %p ('%'d) += %d => %p ('%'d), gapptr@ %p ('%'d) += %d => %p ('%'d)", xy, RGBbits(px24), gapptr, gapptr - &pxbuf[0][0], bp24, bp24 - &pxbuf[0][0], gap_adjust, bp24 + gap_adjust, bp24 + gap_adjust - &pxbuf[0][0], gapptr, gapptr - &pxbuf[0][0], /*pxbuf.width()*/ xres, gapptr + /*pxbuf.width()*/ xres, gapptr + pxbuf.width() - &pxbuf[0][0]);
                *bp24++ = WHITE; //active; // | Abits(WHITE); //only set start bit for active ports
                if (bp24 == gapptr) fatal("data bits[%'d] 0x%x fall into gap@ %p ('%'d)", xy, RGBbits(px24), gapptr, gapptr - &pxbuf[0][0]);
                *bp24++ = px24; //DATA_BITS; //(px24 & active); // | Abits(WHITE); //*++; //1:1 to output px (but pivoted); 24 channel bits are in RGB positions, set alpha so px will be displayed, but only send data for active (dirty) ports
//if (bp24 == gapptr) want_debug = true;
                if (bp24 == gapptr && want_debug-- > 0) debug("gap adjust: bp24@ %p ('%'d) += %d => %p ('%'d), gapptr@ %p ('%'d) += %d => %p ('%'d)", bp24, bp24 - &pxbuf[0][0], gap_adjust, bp24 + gap_adjust, bp24 + gap_adjust - &pxbuf[0][0], gapptr, gapptr - &pxbuf[0][0], /*pxbuf.width()*/ xres, gapptr + /*pxbuf.width()*/ xres, gapptr + xres - &pxbuf[0][0]); //pxbuf.width()
static gpubits_t* svbp24;
static gpubits_t* svgapptr;
                if (bp24 == gapptr) { svbp24 = bp24 += gap_adjust; svgapptr = gapptr += xres + gap_adjust; } //for (int i = 1; i <= gap_adjust; ++i) bp24[-i] = HSYNC_GAP; } //pxbuf.width(); }
                else *bp24++ = BLACK; //0 | Abits(WHITE); //all ports get stop bit
            }
        }
//#pragma message(RED_MSG "reinstate here")
        pxbuf.dirty(true); //wait until end of frame (avoids tearing?)
//usleep((int)33e3);
//        size_t want_xyofs = (NULLBITS + /*m_shdata.*/univlen() * WSBITS) * PPB;
//        int y = xyofs / /*m_shdata.*/xtotal, x = xyofs % /*m_shdata.*/xtotal;
//        int want_y = want_xyofs / xtotal, want_x = want_xyofs % xtotal; //pxbuf.width();
        int got_y = (bp24 - &pxbuf[0][0]) / pxbuf.width(), got_x = (bp24 - &pxbuf[0][0]) % pxbuf.width(); //xres
        if (got_y != want_y || got_x != want_x) fatal_type(std::out_of_range, "bp24 @%p ('%'d) landed on px[y %'d][x %'d], expected px[y %'d][x %'d] @%p eoframe", bp24, bp24 - &pxbuf[0][0], got_y, got_x, want_y, want_x, &pxbuf[want_y][want_x]);
        if (save_debug) debug("pivot %'d nodes onto %'d+%d x %'d canvas took %'d usec, active 0x%x @eof", /*m_shdata.*/univlen(), xres, gap_adjust, pxbuf.height(), perf.elapsed() /*<(int)1e6>(started_usec)*/, WHITE); //active);
    }
//limit brightness:
//212 == 83% limit; max 60 => 50 mA / LED
//170 == 67% limit; max 60 => 40 mA / LED
//128 == 50% limit: max 60 => 30 mA / LED
//    static inline wsnode_t limit(wsnode_t node) { return node; } //do this in caller; some (diffused) nodes might need full brightness
    inline static wsnode_t limit(wsnode_t color, int LIMIT3)
    {
        if (!LIMIT3) return color;
        int r = R(color), g = G(color), b = B(color);
        int br = r + g + b; //brightness(color);
        if (br <= LIMIT3/*_BRIGHTNESS * 3*/) return color; //TODO: maybe always do it? (to keep relative brightness correct)
//TODO: cache results?
//NOTE: palette-based nodes would make this more efficient
//    return toARGB(A(color), r, g, b);
//linear calculation is more efficient but less accurate than HSV conversion+adjust:
        int dimr = r * LIMIT3/*_BRIGHTNESS * 3*/ / br;
        int dimg = g * LIMIT3/*_BRIGHTNESS * 3*/ / br;
        int dimb = b * LIMIT3/*_BRIGHTNESS * 3*/ / br;
//debug("r %d * %d / %d => %d, g %d * %d / %d => %d, b %d * %d / %d => %d", r, 3 * LIMIT_BRIGHTNESS, br, dimr, g, 3 * LIMIT_BRIGHTNESS, br, dimg, b, 3 * LIMIT_BRIGHTNESS, br, dimb);
        return Abits(color) | (dimr << 16) | (dimg << 8) | (dimb << 0); //LIMIT3 / br < 1; don't need clamp()
    }
//check timer accuracy:
    static void timer_check()
    {
//        usec_t started = now_usec();
        timer_t<(int)1e6> calibrate; //elapsed<(int)1e6>(started_usec); //now_msec(started);
        usleep(100e3);
//        int elapsed = delta_usec(started); //(now_latest.tv_sec - started.tv_sec) * (int)1e6 + now_latest.tv_usec - started.tv_usec;
        debug("timer calibration: sleep(100 msec) took %'d usec", calibrate.elapsed()); //<(int)1e6>(started_usec)); //now_usec() - started);
//        return elapsed;
    }
    void memperf_check()
    {
        timer_t<(int)1e6> memperf;
        int full_len = SIZEOF(wsnodes_poolmax) / NUMBUFS; //sizeof(wsnodes[0]) / sizeof(wsnodes[0][0][0]);
if (full_len != NUMPORTS * UNIV_MAXLEN) fatal("full len %s %'d (%d, %d) wrong, should be %'lu", std::remove_cvref_t<decltype(wsnodes[0])>::item_type, full_len, sizeof(wsnodes[0]), sizeof(wsnodes[0][0][0]), NUMPORTS * UNIV_MAXLEN);
        memset<wsnode_t>(&wsnodes[0][0][0], BLACK, full_len);
        auto full_time = memperf.elapsed();
        int part_len = &wsnodes[1][0][0] - &wsnodes[0][0][0]; //NUMPORTS * univlen();
if (part_len != NUMPORTS * univlen()) warn("part len %'d wrong, should be %'lu", part_len, NUMPORTS * univlen());
        memset<wsnode_t>(&wsnodes[0][0][0], BLACK, part_len);
        auto part_time = memperf.elapsed();
        debug("mem perf: full (%'d) took %'d usec, partial (%'d) took %'d usec", full_len, full_time, part_len, part_time);
    }
//check updloop status:
//check process status by pid: R=running, S=sleeping(most will be), T=terminated, Z=zombie, D=disk sleep, X=dead; https://linux.die.net/man/5/proc https://gitlab.com/procps-ng/procps
    inline bool isRunning() { /*debug("isrunning? pid %d status '%c'", bkgpid.load(), proc_status(bkgpid))*/; return strchr("tRS", proc_status(/*m_shdata.*/bkgpid)); } //kludge: incl "t"; seems to mean "self" or maybe cur thread
    static char proc_status(int pid)
    {
         const char NONE = '!'; //'\0'; //NOTE: strchr finds \0 so use non-0 value here
         if (!pid) return NONE;
         AutoFile bkg(strprintf("/proc/%d/status", pid), O_RDONLY);
//         char buf[500]; //filename[50];
//         snprintf(buf, sizeof(buf), "/proc/%d/status", pid);
//         int fd = open(buf, O_RDONLY, 0);
         if (!bkg.isOpen()) return NONE;
         char buf[500];
         int num_read = read(bkg, buf, sizeof(buf));
//         close(fd);
         if (num_read < 1) fatal("can't read proc status"); //return NONE;
         const char* bp = strstr(buf, "State:\t");
         if (!bp) fatal("can't find proc status");
         return bp[1]; //bp? bp[1]: NONE;
    }
};


//JS proxy objects:
//used as wrappers for (parts of) shm

//NAPI_EXPORT_CLASS(shmdata_t::frbuf_t::port_t, "port_t");
class port_shm
{
    using self_t = port_shm;
    using DELEGATED_T = typename shmdata_t/*::frbuf_t*/::port_t;
//    using wsnode_t = typename shmdata_t::frbuf_t::port_t::wsnode_t;
    DELEGATED_T* m_ptr = 0;
public: //ctor/dtor; TODO: find out why this must be < napi props
//    template <typename ... ARGS>
//    port_shm(ARGS&& ... args): m_ptr(new DELEGATED_T(std::forward<ARGS>(args) ...)) {} //perfect fwd
//    port_shm(DELEGATED_T* shm): m_ptr(shm) {} //pre-allocated
    port_shm(const Napi::CallbackInfo& info): m_ptr(DELEGATED_T::prealloc(0)) //use pre-allocated shm; TODO: placement new?
    {
        if (info.Length()) RETURN(err_napi(info.Env(), "port_shm(): args !expected; got: %d %s", info.Length(), NapiArgType(info, 0)));
//static properties:
//        info.This().As<Napi::Object>().Set("wsnodes", /*Napi::Persistent*/(/*m_ptr->*/wsnodes_getter(info))); //TODO: when to unref?
    }
    ~port_shm() {} //if (m_ptr) delete m_ptr; } //debug(PINK_MSG "dealloc %d bytes? %d", sizeof(CLS_T), !!m_ptr); private: //delegated:
//TODO:    NAPI_DELEGATE_EXPORTS(self_t, m_ptr); napi helper macro to delegate props + methods
    NAPI_START_EXPORTS(self_t); //, CLS_T);
    NAPI_EXPORT_PROPERTY(self_t, "brlimit", m_ptr->brlimit_load, m_ptr->brlimit_store); //JS wriable
//    NAPI_EXPORT_PROPERTY(self_t, "dirtylen", m_ptr->dirtylen.load, m_ptr->dirtylen.store); //JS writable
    NAPI_STOP_EXPORTS(self_t); //public
};
NAPI_EXPORT_CLASS(port_shm, "port_t");
//NAPI_EXPORT_CLASS(shmdata_t::frbuf_t, "frbuf");


class frbuf_shm
{
    using self_t = frbuf_shm;
    using DELEGATED_T = typename shmdata_t::frbuf_t;
//    using port_t = typename shmdata_t::frbuf_t::port_t;
    DELEGATED_T* m_ptr = 0;
//delegated:
//TODO:    NAPI_DELEGATE_EXPORTS(self_t, m_ptr); napi helper macro to delegate props + methods
    NAPI_START_EXPORTS(self_t); //, CLS_T);
    NAPI_EXPORT_PROPERTY(self_t, "seqnum", m_ptr->seqnum.load); //JS read-only
    NAPI_EXPORT_PROPERTY(self_t, "frnum", m_ptr->frnum.load); //JS read-only
//no; don't even give fr# to JS (fr rate likely differs)    NAPI_EXPORT_PROPERTY(self_t, "frnum", m_ptr->frnum()); //.load); //JS read-only
    NAPI_EXPORT_PROPERTY(self_t, "timestamp", m_ptr->timestamp); //.load); //JS read-only
//    Napi::Value ports_getter(const Napi::CallbackInfo &info) { return m_ptr->ports_getter(info); }
//    NAPI_EXPORT_METHOD(self_t, "cancel", cancel_method); //m_ptr->cancel_method);
    NAPI_STOP_EXPORTS(self_t); //public
public: //ctor/dtor
//    template <typename ... ARGS>
//    frbuf_shm(ARGS&& ... args): m_ptr(new DELEGATED_T(std::forward<ARGS>(args) ...)) {} //perfect fwd
//    frbuf_shm(DELEGATED_T* shm): m_ptr(shm) {} //pre-allocated
    frbuf_shm(const Napi::CallbackInfo& info): m_ptr(DELEGATED_T::prealloc(0)) //use pre-allocated shm; TODO placement new?
    {
        if (info.Length()) RETURN(err_napi(info.Env(), "frbuf_shm(): args !expected; got: %d %s", info.Length(), NapiArgType(info, 0)));
//        ports_js = ports_getter(info);
//static properties:
//        info.This().As<Napi::Object>().Set("ports", /*Napi::Persistent*/(/*m_ptr->*/ports_getter(info))); //TODO: when to unref?
    }
    ~frbuf_shm() {} //if (m_ptr) delete m_ptr; } //debug(PINK_MSG "dealloc %d bytes? %d", sizeof(CLS_T), !!m_ptr); }
};
NAPI_EXPORT_CLASS(frbuf_shm, "frbuf_t");
//template<int NUMBUFS = 4, int UNIV_MAXLEN = scrinfo::fps2nodes(MIN_FPS)>
//using shmdata_t = struct shmdata<>; //NUMBUFS, UNIV_MAXLEN>;


//#include <vector>
//#include <tuple>
//#include <thread>
//#include <functional> //std::function<>
//#include "promiseWrapper.h" //promiseFuncWrapper //https://github.com/SurienDG/NAPI-Thread-Safe-Promise
class YALP_shm
{
public:
    CONSTDEF(SHMKEY, 0x59414C4F); //ASCII "YALP"
private:
    using self_t = YALP_shm;
//    using DELEGATED_T = YALP;
//    DELEGATED_T* m_ptr = 0;
//    using numfr_t = YALP::numfr_t; //typename shmdata_t::numfr_t;
//    using numfr_t = decltype(YALP::stats)::numfr_t;
//    using numfr_t = typename decltype(stats.numfr)::value_type; // /*struct*/ stats.numfr::value_type;
    using numfr_t = decltype(shmdata_t::stats)::numfr_t;
    using frbuf_t = typename shmdata_t::frbuf_t;
    using port_t = typename shmdata_t::port_t;
    using wsnode_t = typename shmdata_t::wsnode_t;
    using opts_t = typename YALP::/*struct*/ opts_t;
    shmwrap<YALP, SHMKEY> m_shmptr; //(ptr to) one shared copy
    using PROVIDER_LOCKTYPE = typename decltype(m_shmptr->m_mtx)::PROVIDER_LOCKTYPE;
//delegated:
    NAPI_START_EXPORTS(self_t); //, CLS_T);
//misc/config:
    NAPI_EXPORT_PROPERTY(self_t, "debug_level", m_shmptr->debug_level.load, m_shmptr->debug_level.store); //JS can update
    NAPI_EXPORT_PROPERTY(self_t, "bkgpid", m_shmptr->bkgpid.load, m_shmptr->bkgpid.store); //JS can update
    NAPI_EXPORT_PROPERTY(self_t, "fifo", m_shmptr->fifo.load); //aget_fifo); //JS read-only
    const char* get_seqname() { return m_shmptr->seqname; }
    void set_seqname(const char* newstr) { strncpy(m_shmptr->seqname, newstr, sizeof(m_shmptr->seqname)); } //needs shim due to commas :(
    NAPI_EXPORT_PROPERTY(self_t, "seqname", /*m_shmptr->*/get_seqname, /*m_shmptr->*/set_seqname); //[](){ return seqname; }, set_seqname); JS update
#ifdef USING_NAPI //wrap nodes and return to JS:
//CAUTION: caller is assumed to be accessing frbuf way ahead of time so frbuf !locked (atomics help caller resolve)
    Napi::Value spares_getter(const Napi::CallbackInfo &info)
    {
        auto arybuf = Napi::ArrayBuffer::New(info.Env(), &m_shmptr->spare[0], sizeof(m_shmptr->spare)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        auto retary = Napi::TypedArrayOf<std::remove_cvref<decltype(m_shmptr->spare[0])>::type>::New(info.Env(), SIZEOF(m_shmptr->spare), arybuf, 0, napi_uint32_array); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
        return retary;
    }
#endif //def USING_NAPI
//    NAPI_EXPORT_WRAPPED_PROPERTY(self_t, "spares", spares_getter);
//stats (read-only JS):
    NAPI_EXPORT_PROPERTY(self_t, "numfr", m_shmptr->stats.numfr.load); //, stats.numfr.store);
    NAPI_EXPORT_PROPERTY(self_t, "busy_time", m_shmptr->stats.busytime.load);
    NAPI_EXPORT_PROPERTY(self_t, "emit_time", m_shmptr->stats.emittime.load);
    NAPI_EXPORT_PROPERTY(self_t, "idle_time", m_shmptr->stats.idletime.load);
    NAPI_EXPORT_PROPERTY(self_t, "last_updloop", m_shmptr->stats.last_updloop.load);
    NAPI_EXPORT_PROPERTY(self_t, "elapsed", m_shmptr->stats.elapsed_msec); //[this]() { return elapsed<(int)1e3>(stats.started.load()); }); //aget_elapsed_msec);
//ports:
#ifdef USING_NAPI //wrap ports and return to JS:
//CAUTION: caller is assumed to be accessing frbuf way ahead of time so frbuf !locked (atomics help caller resolve)
//    Napi::Array ports_js;
    Napi::Value ports_getter(const Napi::CallbackInfo &info)
    {
//        Napi::Env env = info.Env();
        auto retary = Napi::Array::New(info.Env(), SIZEOF(m_shmptr->ports)); //YALP::NUMPORTS);
//            Napi::Value arg
//            std::vector<Napi::Value> args;
//        debug("ports getter");
        for (size_t i = 0; i < SIZEOF(m_shmptr->ports); ++i) //NUMPORTS; ++i)
        {
//                new (&ports[i]) port_t(info); //::new(sizeof(port_t), &ports[i]); //set new port addr within shm
//            std::vector<Napi::Value> args;
//            args.push_back(Napi::Number::New(info.Env(), i));
//            retary[i] = ExportedClass<port_napi>::NewInstance(info.Env(), args);
            port_t::prealloc(&m_shmptr->ports[i]);
//            long ii = i; //RPi requires "long"
            /*Napi::Value port*/ retary[i] = ExportedClass<port_shm>::NewInstance(info.Env()); //, args);
//            retary[i] = Napi::ObjectReference::New(port, 1); //ref count 1 to prevent gc
        }
        return retary;
    }
#endif //def USING_NAPI
//    NAPI_EXPORT_WRAPPED_PROPERTY(self_t, "ports", /*m_ptr->*/ports_getter);
//frbufs:
//    Napi::Value frbufs_getter(const Napi::CallbackInfo &info) { return m_shmptr->frbufs_getter(info); }
#ifdef USING_NAPI //wrap ports and return to JS:
//CAUTION: caller is assumed to be accessing frbuf way ahead of time so frbuf !locked (atomics help caller resolve)
    Napi::ObjectReference frbufs_js[YALP::NUMBUFS]; //DON'T incl 1 extra for null
//    Napi::Value fbptr2napi(const Napi::Object& This, frbuf_t* fbptr) //Napi::CallbackInfo &info)
//    Napi::ObjectReference& fbptr2napi(/*const Napi::Env& env,*/ /*const*/ frbuf_t* fbptr)
    Napi::Value fbptr2napi(const Napi::Env& env, const frbuf_t* fbptr)
    {
//if (!fbptr) debug("ret null frbuf to caller");
if (fbptr && fbptr != &m_shmptr->frbufs[0] && fbptr != &m_shmptr->frbufs[1] && fbptr != &m_shmptr->frbufs[2] && fbptr != &m_shmptr->frbufs[3]) fatal("inv frbuf ptr@ %p", fbptr);
//        if (!fbptr) return env.Undefined();
        int fifo = fbptr? fbptr - &m_shmptr->frbufs[0]: -1; //YALP::NUMBUFS;
        if (fbptr && !(0 <= fifo && fifo < SIZEOF(frbufs_js))) fatal("bad fifo value: %'d should be 0..%d", fifo, SIZEOF(frbufs_js) - 1); //NUMBUFS - 1);
//debug("ret frbuf[%d] seq# %'d, fr# %'d, timestamp %'d to caller", fifo, fbptr->seqnum.load(), fbptr->frnum.load(), fbptr->timestamp());
//??        Napi::ObjectReference retval = Napi::ObjectReference::New(frbuf, 1); //TODO: when to unref?
//().Get(fifo).As<Napi::Object>(); //TODO: use ref here?
//        Napi::ObjectReference& retval = frbufs_js[fifo]; //.Value();
        Napi::Value retval = fbptr? frbufs_js[fifo].Value(): env.Undefined();
//        int newcount = retval.Ref(); //bump ref count
        return retval; //frbuf_napi[fifo];
    }
    Napi::Value frbufs_getter(const Napi::CallbackInfo &info)
    {
//debug("arybuf len %'lu", (char*)&m_shmptr->wsnodes[YALP::NUMBUFS][0][0] - (char*)&m_shmptr->wsnodes[0][0][0]);
        auto arybuf = Napi::ArrayBuffer::New(info.Env(), &m_shmptr->wsnodes[0][0][0], (char*)&m_shmptr->wsnodes[YALP::NUMBUFS][0][0] - (char*)&m_shmptr->wsnodes[0][0][0]); //sizeof(m_shmptr->wsnodes)); //size in bytes //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
//        Napi::Env env = info.Env();
//        static bool init = false;
//        debug("frbufs getter: this@ %p, shm ptr %p", this, &m_shmptr->m_first); //NOTE: can't refer simply to "m_shmptr" here (requires ctor args)
        /*static*/ auto retary = Napi::Array::New(info.Env(), YALP::NUMBUFS); //SIZEOF(m_shmptr->frbufs)); //NUMBUFS); //cached
//            Napi::Value arg
//            std::vector<Napi::Value> args;
//        if (!init)
        for (size_t i = 0; i < YALP::NUMBUFS; ++i) //SIZEOF(m_shmptr->frbufs); ++i) //NUMBUFS; ++i)
        {
//                new (&frbufs[i]) frbuf_t(info); //::new(sizeof(frbuf_t), &frbufs[i]); //set new frbuf addr within shm
//debug("here1");
//            std::vector<Napi::Value> args;
//            args.push_back(Napi::Number::New(info.Env(), i));
//            Napi::Object frbuf = ExportedClass<frbuf_napi>::NewInstance(info.Env(), args);
            frbuf_t::prealloc(&m_shmptr->frbufs[i]);
//Napi::FunctionReference* pctor = ExportedClass<port_shm>::get_ctor(info.Env());
//Napi::FunctionReference* fctor = ExportedClass<frbuf_shm>::get_ctor(info.Env());
//Napi::FunctionReference* yctor = ExportedClass<YALP_shm>::get_ctor(info.Env());
//debug("here2, ctors %p %p %p", pctor, fctor, yctor);
//const char* pcls = ExportedClass<port_shm>::classname;
//const char* fcls = ExportedClass<frbuf_shm>::classname;
//const char* ycls = ExportedClass<YALP_shm>::classname;
//debug("here2, cls %s %s %s", pcls, fcls, ycls);
            Napi::Object frbuf = ExportedClass<frbuf_shm>::NewInstance(info.Env()); //, args);
//attach 2D nodes to frbuf object:
//debug("2Dary len %'lu", &m_shmptr->wsnodes[1][0][0] - &m_shmptr->wsnodes[0][0][0]);
            /*static*/ auto nodes2D = Napi::Array::New(info.Env(), YALP::NUMPORTS); //&m_shmptr->wsnodes[1][0][0] - &m_shmptr->wsnodes[0][0][0]); //YALP::NUMPORTS * univlen()); //SIZEOF(m_shmptr->wsnodes[0]));
            for (size_t p = 0; p < /*SIZEOF(m_shmptr->wsnodes[0])*/ YALP::NUMPORTS; ++p)
            {
//                long pp = p; //RPi requires "long"
//debug("uint ary ofs %'lu", (char*)&m_shmptr->wsnodes[i][p][0] - (char*)&m_shmptr->wsnodes[0][0][0]);
                nodes2D[p] = Napi::TypedArrayOf</*shmdata_t::frbuf_t::port_t::*/ YALP::wsnode_t>::New(info.Env(), m_shmptr->univlen(), arybuf, (char*)&m_shmptr->wsnodes[i][p][0] - (char*)&m_shmptr->wsnodes[0][0][0], napi_uint32_array); //CAUTION: port nodes are packed within each frbuf; #elements, byte ofs; //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
            }
            frbuf.Set("wsnodes", nodes2D);
//debug("js frbuf[%d]: seq# %'d, fr# %'d", i, napi2val<int>(frbuf.Get("seqnum")), napi2val<int>(frbuf.Get("frnum")));
            frbufs_js[i] = Napi::Persistent(frbuf); //ref count 1 to prevent gc
//            long ii = i; //RPi requires "long"
            retary[i] = frbuf; //RPi requires "long"
//            retary[i] = Napi::ObjectReference::New(port, 1); //ref count 1 to prevent gc
//debug("here3");
        }
//        frbufs_js[YALP::NUMBUFS] = info.Env().Null(); //Undefined();
//        init = true;
//        if (retary.Env() != info.Env()) /*return err_napi(info.Env(),*/ fatal("frbuf ret ary env mismatch: created in 0x%x, accessed in 0x%x", retary.Env(), info.Env());
        return retary;
    }
#endif //def USING_NAPI
//    NAPI_EXPORT_WRAPPED_PROPERTY(self_t, "frbufs", /*m_ptr->*/frbufs_getter);
//    int get_univ_maxlen() { return frbuf_t::port_t::UNIV_MAXLEN; }
//    NAPI_EXPORT_PROPERTY(self_t, "UNIV_MAXLEN", /*m_shmptr->*/get_univ_maxlen);
//    NAPI_EXPORT_WRAPPED_PROPERTY(self_t, "on", /*m_ptr->*/add_evth_method);
//    NAPI_EXPORT_WRAPPED_PROPERTY(self_t, "off", /*m_ptr->*/del_evth_method);
//    NAPI_EXPORT_WRAPPED_PROPERTY(self_t, "once", /*m_ptr->*/once_evth_method);
#ifdef USING_NAPI
//nodes:
#if 0 //def USING_NAPI //wrap nodes and return to JS:
//CAUTION: caller is assumed to be accessing frbuf way ahead of time so frbuf !locked (atomics help caller resolve)
    Napi::Value wsnodes_getter(const Napi::CallbackInfo &info)
    {
//NOTE: caller is responsible for setting dirty flag
//        Napi::Env env = info.Env();
//                static shmdata_t& m_shdata(NoInit{});
//                static shmdata_t& m_shdata = *(new shmdata_t(NoInit{})); //m_shdata(NoInit{});
        shmdata_t* m_shdata = shmdata_t::shm_singleton();
        auto arybuf = Napi::ArrayBuffer::New(info.Env(), &m_shdata->wsnodes[0][0][0], sizeof(m_shdata->wsnodes)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        auto retary = Napi::TypedArrayOf</*shmdata_t::frbuf_t::port_t::*/ wsnode_t>::New(info.Env(), m_shdata->univlen(), arybuf, 0, napi_uint32_array); ////https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
        return retary;
    }
#endif //def USING_NAPI
//non-blocking:
    Napi::Value oldest_getter(const Napi::CallbackInfo &info)
    {
        auto fbptr = m_shmptr->oldest();
//        return fbptr2napi(info.This().As<Napi::Object>(), fbptr);
        return fbptr2napi(info.Env(), fbptr); //fbptr can't be null here
    }
    Napi::Value newer_getter(const Napi::CallbackInfo &info) //non-blocking
    {
        using seqnum_t = frbuf_t::seqnum_t;
        using timestamp_t = frbuf_t::timestamp_t;
        if (info.Length() != 2 /*|| info.Length() > 3*/ || !info[0].IsNumber() || !info[1].IsNumber() /*|| (info.Length() > 2 && !info[2].IsNumber())*/) return err_napi(info.Env(), "seq# (Number) + timestamp (msec, Number) expected, got %d: %s %s %s", info.Length(), NapiArgType(info, 0), NapiArgType(info, 1)); //, NapiArgType(info, 2));
//        const auto seqnum = info[0].As<Napi::Number>().Uint32Value();
        const seqnum_t want_seq = napi2val<seqnum_t>(info[0]);
//        const auto timestamp = info[1].As<Napi::Number>().Uint32Value();
        const timestamp_t want_time = napi2val<timestamp_t>(info[1]);
        auto fbptr = m_shmptr->newer(want_seq, want_time);
//        return fbptr2napi(info.This().As<Napi::Object>(), fbptr);
//debug("newer %'d: found frbuf# %d, latest %d, others: %'d, %'d, %'d, %'d", want_time, fbptr - &m_shmptr->frbufs[0], m_shmptr->fifo.load(), m_shmptr->frbufs[0].timestamp(), m_shmptr->frbufs[1].timestamp(), m_shmptr->frbufs[2].timestamp(), m_shmptr->frbufs[3].timestamp());
        return fbptr2napi(info.Env(), fbptr); //fbptr *can* be null here
    }
    Napi::Value wait4newer_getter(const Napi::CallbackInfo &info) //blocking
    {
        using seqnum_t = frbuf_t::seqnum_t;
        using timestamp_t = frbuf_t::timestamp_t;
        if (info.Length() != 2 /*|| info.Length() > 3*/ || !info[0].IsNumber() || !info[1].IsNumber() /*|| (info.Length() > 2 && !info[2].IsNumber())*/) return err_napi(info.Env(), "seq# (Number) + timestamp (msec, Number) expected, got %d: %s %s %s", info.Length(), NapiArgType(info, 0), NapiArgType(info, 1)); //, NapiArgType(info, 2));
//        const auto seqnum = info[0].As<Napi::Number>().Uint32Value();
        const seqnum_t want_seq = napi2val<seqnum_t>(info[0]);
//        const auto timestamp = info[1].As<Napi::Number>().Uint32Value();
        const timestamp_t want_time = napi2val<timestamp_t>(info[1]);
        auto fbptr = m_shmptr->wait4newer(want_seq, want_time);
//        return fbptr2napi(info.This().As<Napi::Object>(), fbptr);
//debug("newer %'d: found frbuf# %d, latest %d, others: %'d, %'d, %'d, %'d", want_time, fbptr - &m_shmptr->frbufs[0], m_shmptr->fifo.load(), m_shmptr->frbufs[0].timestamp(), m_shmptr->frbufs[1].timestamp(), m_shmptr->frbufs[2].timestamp(), m_shmptr->frbufs[3].timestamp());
        return fbptr2napi(info.Env(), fbptr); //fbptr *can* be null here
    }
#endif //def USING_NAPI
    NAPI_EXPORT_WRAPPED_PROPERTY(self_t, "oldest", /*m_ptr->*/oldest_getter);
    NAPI_EXPORT_METHOD(self_t, "newer", /*m_ptr->*/newer_getter);
    NAPI_EXPORT_METHOD(self_t, "wait4newer", /*m_ptr->*/wait4newer_getter);
#ifdef USING_NAPI
    Napi::Value recycle_method(const Napi::CallbackInfo& info)
    {
        using seqnum_t = frbuf_t::seqnum_t;
        if (info.Length() > 1 || (info.Length() && !info[0].IsNumber())) return err_napi(info.Env(), "seq# (optional Number)expected, got %d: %s", info.Length(), NapiArgType(info, 0));
//        const auto seqnum = info[0].As<Napi::Number>().Uint32Value();
        const seqnum_t seqnum = info.Length()? napi2val<seqnum_t>(info[0]): m_shmptr->oldest()->seqnum + 1;
        m_shmptr->recycle(seqnum);
        return Napi::Number::New(info.Env(), seqnum); //give new#
    }
#endif //def USING_NAPI
    NAPI_EXPORT_METHOD(self_t, "recycle", recycle_method);
//control:
    NAPI_EXPORT_PROPERTY(self_t, "seqnum", m_shmptr->oldest()->seqnum.load);
    NAPI_EXPORT_PROPERTY(self_t, "timestamp", m_shmptr->oldest()->timestamp); //.load);
#ifdef USING_NAPI //simpler bkg thread (blocking) using mutex/condvar for wakeup
//https://github.com/nodejs/node-addon-examples/issues/85
    template<typename RETVAL_T = uint32_t, class SUPER = Napi::AsyncWorker>
//    using que_t = uint32_t; //shmdata_t::frbuf_t; //kludge: napi only allows simple types
    class UpdLoopAsyncWker: public SUPER
    {
        self_t* m_ptr;
        Napi::Promise::Deferred m_deferred;
        RETVAL_T m_retval;
    public:
        UpdLoopAsyncWker(const Napi::Env& env, self_t* ptr): SUPER(env), m_ptr(ptr), m_deferred(Napi::Promise::Deferred::New(env)) { this->Queue(); }
        ~UpdLoopAsyncWker() {}
    public:
        Napi::Promise::Deferred& def() /*const*/ { return m_deferred; }
        void Execute() //runs inside wker thread; CAUTION: cannot access JS
        {
            PROVIDER_LOCKTYPE lock(m_ptr->m_shmptr->m_mtx); //NOTE: mutex must be held while var is changed even if atomic, according to https://en.cppreference.com/w/cpp/thread/condition_variable
            auto emitfr = [this /*m_ptr*/](shmdata_t::frbuf_t* fbptr = 0)
            {
//                QUE_T msg = fbptr? fbptr - &ptr->m_shmptr->frbufs[0]: -1;
//            { //lock scope
//                PROVIDER_LOCKTYPE lock(m_mtx); //NOTE: mutex must be held while var is changed even if atomic, according to https://en.cppreference.com/w/cpp/thread/condition_variable
//                ++dequeue()->seqnum; //get oldest + mark eof
//            }
                VOID m_ptr->m_shmptr->m_cv.notify_all(); //wake render/wker threads waiting for more frbufs
//debug("progress: fbptr@ %p, seq# %d, fr# %'d => fb# %d", fbptr, fbptr? fbptr->seqnum.load(): -1, fbptr? fbptr->frnum.load(): -1, msg);
            };
            m_retval = m_ptr->m_shmptr->updloop(emitfr);
        }
        void OnOK() //runs inside main evt loop; safe to use JS data
        {
            m_deferred.Resolve(Napi::Number::New(this->Env(), m_retval));
        }
        void OnError(Napi::Error const& error) { m_deferred.Reject(error.Value()); }
    };
    Napi::Value updloop_method(const Napi::CallbackInfo& info)
    {
        if (info.Length()) return err_napi(info.Env(), "no args expected, got %d: %s", info.Length(), NapiArgType(info, 0)); //do this here so err can be ret to caller
//        Napi::Promise::Deferred promise = Napi::Promise::Deferred::New(info.Env());
        /*UpdLoopAsyncWker* */ auto wker = new UpdLoopAsyncWker(info.Env(), this); //run on bkg thread so main thread doesn't block; NOTE: deduction !worky for ptrs/refs; need "auto" here
        Napi::Value retval = wker->def().Promise();
        return retval;
    }
#endif //def USING_NAPI
#if 0 //def USING_NAPI
//https://github.com/nodejs/node-addon-api/blob/main/doc/async_worker_variants.md
//https://github.com/mika-fischer/napi-thread-safe-callback/issues/10
//https://github.com/SurienDG/NAPI-Thread-Safe-Promise
//CAUTION: *Queue* wker needed if renderers need to rcv all frames on main JS thread
    template<typename QUE_T = uint32_t, class SUPER = Napi::/*AsyncProgressWorker*/AsyncProgressQueueWorker<QUE_T>>
//    using que_t = uint32_t; //shmdata_t::frbuf_t; //kludge: napi only allows simple types
    class UpdloopAsyncWker: public SUPER
    {
//        using SUPER = Napi::AsyncProgressWorker/*AsyncProgressQueueWorker*/<QUE_T>;
//        Napi::FunctionReference m_cb;
        self_t* m_ptr;
        numfr_t m_retval;
        Napi::Promise::Deferred m_promise;
        Napi::FunctionReference m_cb;
//        auto Finalizer = //[&bkg]( Napi::Env ) { bkg.join(); }; //finalizer used to clean up thread
//            [&bkg](Napi::Env, FinalizerDataType*, Context* ctx) { debug(CYAN_MSG "finalizer"); /*bkg.join()*/; delete ctx; }; //finalizer used to clean up thread
//        tsfn = TSFN::New(info.Env(), evth, "YALP frbuf evth", UnlimQuelen, NumThreads, ctx, Finalizer); //NOTE: can only be called from main thread
//    context->tsfn = Napi::ThreadSafeFunction::New(
//        env, Napi::Function::New(env, [](const Napi::CallbackInfo &info) {}),
//        "TSFN", 0, 1, [context, mu](Napi::Env env)
//    {
//            mu->lock();
//            if (context->resolve) context->deferred.Resolve(Napi::String::New(env, context->data));
//            else context->deferred.Reject(Napi::Error::New(env, context->data).Value());
//            mu->unlock();
//    });
//    Napi::Function::New(env, [](const Napi::CallbackInfo &info) {};
    public:
        UpdloopAsyncWker(Napi::Env env, Napi::Function& cb, self_t* ptr): SUPER(env), m_ptr(ptr), m_retval(-1), m_promise(Napi::Promise::Deferred::New(env)), m_cb(Napi::Persistent(cb)) {} //m_ptr->Ref(); }
        ~UpdloopAsyncWker() { m_cb.Unref(); m_cb.Reset(); } //m_ptr->Unref(); } //is this needed?
        Napi::Promise::Deferred& def() { return m_promise; }
        void Execute(const typename SUPER::ExecutionProgress& progress) //executed on wker thread; CAUTION: don't call napi
        {
//debug("napi updloop start");
            self_t* ptr = m_ptr; //avoid capturing "this" (not restrictive)
            auto emitfr = [/*this*/ ptr, progress](shmdata_t::frbuf_t* fbptr = 0)
            {
                QUE_T msg = fbptr? fbptr - &ptr->m_shmptr->frbufs[0]: -1;
//debug("progress: fbptr@ %p, seq# %d, fr# %'d => fb# %d", fbptr, fbptr? fbptr->seqnum.load(): -1, fbptr? fbptr->frnum.load(): -1, msg);
                progress.Send(&msg, 1); //triggers OnProgress() on evt loop thread
            };
            m_retval = m_ptr->m_shmptr->updloop(emitfr); //run on bkg thread so main thread doesn't block
//debug("napi updloop ret with #fr %'d", m_retval);
        }
        void OnProgress(const QUE_T* msg, size_t ignored /* count */) //Send() called during Execute()
        {
            shmdata_t::frbuf_t* fbptr = (*msg != (QUE_T)-1)? &m_ptr->m_shmptr->frbufs[*msg]: 0; //kludge: convert back to fbptr
//debug("progress: msg %d => fbptr@ %p, seq# %d, fr# %'d", *msg, fbptr, fbptr? fbptr->seqnum.load(): -1, fbptr? fbptr->frnum.load(): -1);
            Napi::HandleScope scope(SUPER::Env());
//            if (!this->progressCallback.IsEmpty()) {
//                this->progressCallback.Call(Receiver().Value(), {Number::New(Env(), *data)});
//            SUPER::Callback().Call(/*Receiver().Value()*/ SUPER::Env().Null(), {m_ptr->fbptr2napi(SUPER::Env(), fbptr)});
            m_cb.Call(scope.Env().Null(), {m_ptr->fbptr2napi(scope.Env(), fbptr)});
        }
        void OnOK() //Execute() completed successfully
        {
debug(GREEN_MSG "onok: resolve %'d", m_retval);
            Napi::HandleScope scope(SUPER::Env());
//            m_promise.Resolve(Napi::Number::New(Env(), m_numfr));
//            m_onok(Napi::Number::New(SUPER::Env(), m_retval));
            m_cb.Call(scope.Env().Null(), {scope.Env().Null()});
            m_promise.Resolve(Napi::Number::New(scope.Env(), m_retval));
//            m_ptr->Unref();
//            m_cb.Unref();
//            m_cb.Reset(); //is this needed?
//debug("here1");
        }
        void OnError(const Napi::Error &err) //error during Execute(); TODO: is this needed?
        {
debug(RED_MSG "onerr: msg %s", err.Message().c_str());
            Napi::HandleScope scope(SUPER::Env());
//            // We call our callback provided in the constructor with 2 parameters
//            if (!this->errorCallback.IsEmpty()) {
//                // Call our onErrorCallback in javascript with the error message
//                this->errorCallback.Call(Receiver().Value(), {String::New(Env(), e.Message())});
//            }
//            m_promise.Reject(Napi::String::New(Env(), err.Message()));
//            m_onerr(Napi::String::New(SUPER::Env(), err.Message()));
            m_promise.Reject(Napi::String::New(scope.Env(), err.Message()));
//            m_ptr->Unref();
//            m_cb.Unref();
//            m_cb.Reset(); //is this needed?
        }
    };
    Napi::Value updloop_method(const Napi::CallbackInfo& info)
    {
        if (info.Length() != 1 || !info[0].IsFunction()) return err_napi(info.Env(), "evt handler (function) expected, got %d: %s", info.Length(), NapiArgType(info, 0)); //do this here so err can be ret to caller
        Napi::Function evth = info[0].As<Napi::Function>(); //don't need Persistent() due to acq/rel?
//        Napi::Promise::Deferred promise = Napi::Promise::Deferred::New(info.Env());
        UpdloopAsyncWker<>* wker = new UpdloopAsyncWker<>(info.Env(), evth, this); //RPi requires "<>"
//        wker->Queue();
//        return promise.Promise();
        Napi::Value retval = wker->def().Promise();
        wker->Queue();
        return retval;
    }
#endif //def USING_NAPI
#if 0 //def USING_NAPI
//https://github.com/nodejs/node-addon-api/blob/main/doc/async_worker_variants.md
//https://github.com/mika-fischer/napi-thread-safe-callback/issues/10
//https://github.com/SurienDG/NAPI-Thread-Safe-Promise
//NOTE: don't really need Queue wker; doesn't need *all* evts as long as main JS thread wakes periodically
    template<typename ONOK_T, typename ONERR_T, typename QUE_T = uint32_t>
//    using que_t = uint32_t; //shmdata_t::frbuf_t; //kludge: napi only allows simple types
    class UpdloopAsyncWker: public Napi::AsyncProgressWorker/*AsyncProgressQueueWorker*/<QUE_T>
    {
        using SUPER = Napi::AsyncProgressWorker/*AsyncProgressQueueWorker*/<QUE_T>;
//        Napi::FunctionReference m_cb;
        self_t* m_ptr;
        Napi::Promise::Deferred& m_promise;
        numfr_t m_retval;
        ONOK_T m_onok;
        ONERR_T m_onerr;
    public:
        UpdloopAsyncWker(Napi::Function& cb, self_t* ptr, Napi::Promise::Deferred& promise, ONOK_T onok, ONERR_T onerr): SUPER(cb), /*m_cb(cb),*/ m_ptr(ptr), m_promise(promise), m_onok(onok), m_onerr(onerr) {}
//        {
// Set our function references to use them below
//            this->errorCallback.Reset(errorCallback, 1);
//            this->progressCallback.Reset(progressCallback, 1);
//            m_cb.Reset(cb, 1);
//        }
        ~UpdloopAsyncWker() {}
        void Execute(const typename SUPER::ExecutionProgress& progress) //executed on wker thread; CAUTION: don't call napi
        {
debug("napi updloop start");
            self_t* ptr = m_ptr;
            auto emitfr = [/*this*/ ptr, progress](shmdata_t::frbuf_t* fbptr = 0)
            {
                QUE_T msg = fbptr? fbptr - &ptr->m_shmptr->frbufs[0]: -1;
//debug("progress: fbptr@ %p, seq# %d, fr# %'d => fb# %d", fbptr, fbptr? fbptr->seqnum.load(): -1, fbptr? fbptr->frnum.load(): -1, msg);
                progress.Send(&msg, 1);
            };
            m_retval = m_ptr->m_shmptr->updloop(emitfr); //run on bkg thread so main thread doesn't block
debug("napi updloop ret with #fr %'d", m_retval);
        }
        void OnProgress(const QUE_T* msg, size_t ignored /* count */) //Send() called during Execute()
        {
            shmdata_t::frbuf_t* fbptr = (*msg != (QUE_T)-1)? &m_ptr->m_shmptr->frbufs[*msg]: 0; //kludge: convert back to fbptr
//debug("progress: msg %d => fbptr@ %p, seq# %d, fr# %'d", *msg, fbptr, fbptr? fbptr->seqnum.load(): -1, fbptr? fbptr->frnum.load(): -1);
            Napi::HandleScope scope(SUPER::Env());
//            if (!this->progressCallback.IsEmpty()) {
//                this->progressCallback.Call(Receiver().Value(), {Number::New(Env(), *data)});
            SUPER::Callback().Call(/*Receiver().Value()*/ SUPER::Env().Null(), {m_ptr->fbptr2napi(SUPER::Env(), fbptr)});
        }
        void OnOK() //Execute() completed successfully
        {
debug(GREEN_MSG "onok: resolve %'d", m_retval);
            Napi::HandleScope scope(SUPER::Env());
//            m_promise.Resolve(Napi::Number::New(Env(), m_numfr));
            m_onok(Napi::Number::New(SUPER::Env(), m_retval));
        }
        void OnError(const Napi::Error &err) //error during Execute()
        {
debug(RED_MSG "onerr: msg %s", err.Message().c_str());
            Napi::HandleScope scope(SUPER::Env());
//            // We call our callback provided in the constructor with 2 parameters
//            if (!this->errorCallback.IsEmpty()) {
//                // Call our onErrorCallback in javascript with the error message
//                this->errorCallback.Call(Receiver().Value(), {String::New(Env(), e.Message())});
//            }
//            m_promise.Reject(Napi::String::New(Env(), err.Message()));
            m_onerr(Napi::String::New(SUPER::Env(), err.Message()));
        }
    };
    Napi::Value updloop_method(const Napi::CallbackInfo& info)
    {
        if (info.Length() != 1 || !info[0].IsFunction()) return err_napi(info.Env(), "evt handler (function) expected, got %d: %s", info.Length(), NapiArgType(info, 0)); //do this here so err can be ret to caller
        Napi::Function evth = info[0].As<Napi::Function>(); //don't need Persistent() due to acq/rel?
//        Napi::Promise::Deferred promise = Napi::Promise::Deferred::New(info.Env());
//        UpdloopAsyncWker* wker = new UpdloopAsyncWker(evth, this, promise);
//        wker->Queue();
//        return promise.Promise();
        return promiseFuncWrapper(info.Env(), [&info](resolveFunc resolve, rejectFunc reject)
        {
            auto onok = [resolve](Napi::Value retval) { debug("resolve"); resolve(retval); };
            auto onerr = [reject](Napi::Value errval) { debug("reject"); reject(errval); };
            UpdloopAsyncWker* wker = new UpdloopAsyncWker(evth, this, promise, onok, onerr);
            wker->Queue();
        });
    }
#endif //def USING_NAPI
#if 0 //def USING_NAPI
//https://github.com/mika-fischer/napi-thread-safe-callback/issues/10
    Napi::Value updloop_method(const Napi::CallbackInfo& info)
    {
        if (info.Length() != 1 || !info[0].IsFunction()) return err_napi(info.Env(), "evt handler (function) expected, got %d: %s", info.Length(), NapiArgType(info, 0)); //do this here so err can be ret to caller
        Napi::Function evth = info[0].As<Napi::Function>(); //don't need Persistent() due to acq/rel?
        return promiseFuncWrapper(info.Env(), [&info](resolveFunc resolve, rejectFunc reject)
        {
// anonymous function passed to thread safe resolve and reject functions
// here we can write our threaded code
            std::string arg1 = info[0].As<Napi::String>();
            std::thread([resolve, reject, arg1]()
            {
                resolve or reject(arg1);
            }).detach();
        });
    }
#endif //def USING_NAPI
#if 0 //def USING_NAPI
//https://www.nextptr.com/tutorial/ta1188594113/passing-cplusplus-captureless-lambda-as-function-pointer-to-c-api
//https://github.com/nodejs/node-addon-api/blob/main/doc/typed_threadsafe_function.md
//https://github.com/nodejs/node-addon-api/blob/main/doc/threadsafe_function.md
//https://github.com/nodejs/node-addon-api/blob/main/doc/function_reference.md
//    std::vector<std::tuple<Napi::Function, Napi::ThreadSafeFunction, bool>> evths;
//    void emitfr(frbuf_t* fbptr)
//    {
//        Napi::Value arg[1] = {fbptr2napi(fbptr)}; //, info);
//        for (auto it = evths.begin(); it != evths.end(); ++it)
//        {
//            Napi::Function::MakeCallback(it->first.Value(), 1, &arg); //use current async context
//            if (it->second) { it->first.Unref(); it = evths.erase(it); } //one-shot evth
//        }
//    }
//        using PARENT_T = YALP_shm;
//        PARENT_T/*::m_shdata::wrapped_t*/::numfr_t m_retval;
//run pivot/update loop on bkg thread:
//Napi::AsyncWorker has issues; just use native thread
//    using DataType = shmdata_t::frbuf_t; //frbuf_t;
//    struct 
//    {
//        self_t* that;
//        frbuf_t* fbptr;
//        Napi::Promise::Deferred retval;
//    } fremit_data;
//    using DataType = decltype(fremit_data);
//kludge: tsfn cb only allows 1 ptr arg; use "this" and incl additional info:
    struct fremit_data_t
    {
        frbuf_t* fbptr;
//        Napi::Promise::Deferred promise; //= Napi::Promise::Deferred::New(0); //kludge: requires ctor but !env yet
//        Napi::Object promise;
//        Napi::Promise::Deferred& promise() { static Napi::Promise::Deferred m_promise; return m_promise; }
//        typedef void (Napi::Promise::Deferred::*promise_completion_t)(Napi::Value) /*const*/;
//        promise_completion_t resolve, reject; //kludge: no env during ctor to cre dummy promise, so just store func ptrs
//        Napi::Promise::Deferred* promise; //kludge: need to use ptr; inst requires ctor but !env yet
//        std::vector<Napi::Promise::Deferred> promise; //kludge: inst requires ctor but !env yet
//        fremit_data_t(Napi::Env env): promise(Napi::Promise::Deferred::New(env)) {} //def ctor needed by container
        Napi::Promise::Deferred promise;
//        Napi::Reference<Napi::Promise> ref;
//        Napi::ObjectReference ref;
        fremit_data_t(Napi::Env env): promise(env) {}
        ~fremit_data_t() {}
    } fremit;
//    using DataType = self_t;
    using Context = Napi::Reference<Napi::Value>; //JS "this"
//xlate native data into JS/napi data + pass to JS callback:
//NOTE: must be static and tsfn template requires this type of func sig:
    static void CallJs(Napi::Env env, Napi::Function callback, Context* ctx, self_t* ptr)
    {
//debug("calljs? %d %d, fbptr %p", env != nullptr, callback != nullptr, ptr->fremit.fbptr);
        if ((env == nullptr) || (callback == nullptr)) return; //no longer available; JS doing cleanup?
        Napi::Value retval = ptr->fbptr2napi(env, ptr->fremit.fbptr);
//        int newcount = retval.Ref(); //bump ref count?
//int fifo = ptr->fremit.fbptr? ptr->fremit.fbptr - &ptr->m_shmptr->frbufs[0]: -1;
//debug("upd loop call emitfr with fbptr@ %p => frbuf# %d", fbptr, fifo);
//debug("calljs? %d %d, frbuf# %d, fulfill? %d", env != nullptr, callback != nullptr, fifo, !ptr->fremit.fbptr);
        callback.Call(ctx->Value(), {retval}); //quasi evt emitter; ignore retval from JS
        if (ptr->fremit.fbptr) return; //process more frames
//fulfill promise from original updloop() call:
//            Napi::Value result = Napi::Number::New(env, ptr->m_shmptr->stats.last_updloop);
//debug("get updloop result");
        int result = ptr->m_shmptr->stats.last_updloop; //NOTE: this doesn't see error with final tsfn release
        if (!result) result = ptr->m_shmptr->stats.numfr;
debug(CYAN_MSG "updloop fulfilled, result %'d", result);
//result = -99;
//        Napi::Promise::Deferred promise = ptr->fremit.ref.Value().As<Napi::Promise::Deferred>();
//        Napi::Value prom = ptr->fremit.ref.Value();
//        Napi::Promise::Deferred promise = prom.As<Napi::Promise::Deferred>();
        if (result < 0) ptr->fremit.promise.Reject(Napi::Number::New(env, result));
        else ptr->fremit.promise.Resolve(Napi::Number::New(env, result));
    }
    Napi::Value updloop_method(const Napi::CallbackInfo& info)
    {
        if (info.Length() != 1 || !info[0].IsFunction()) return err_napi(info.Env(), "evt handler (function) expected, got %d: %s", info.Length(), NapiArgType(info, 0)); //do this here so err can be ret to caller
        Napi::Function evth = info[0].As<Napi::Function>(); //don't need Persistent() due to acq/rel?
//        Napi::Promise::Deferred/*&*/ retval = Napi::Promise::Deferred::New(info.Env());
//        Napi::Promise::Deferred promise = Napi::Promise::Deferred::New(info.Env());
//        fremit.promise.clear();
//        fremit.promise.emplace_back(promise); //Napi::Promise::Deferred::New(info.Env());
        fremit.promise = Napi::Promise::Deferred::New(info.Env());
//        fremit.resolve = (Napi::Promise::Deferred::Resolve*)&promise.Resolve;
//        fremit.resolve = &Napi::Promise::Deferred::promise.Resolve;
//        fremit.reject = &promise.Reject;
//        fremit.promise = &promise;
        using TSFN = Napi::TypedThreadSafeFunction<Context, self_t, CallJs>;
//NOTE: globals + static vars can be used without capture
        static std::thread bkg; //NOTE: can't be on stack; join() called after func returns
        static TSFN tsfn; //NOTE: can't be on stack; needs to live past func return
//    void CallJs(Napi::Env env, Function callback, Context *context, DataType *data);
//    std::function<void(Napi::Env, Function, Context*, DataType*)> 
//https://www.nextptr.com/tutorial/ta1188594113/passing-cplusplus-captureless-lambda-as-function-pointer-to-c-api
//    auto CallJs = [] (Napi::Env env, Function callback, Context *context, DataType *data)
//    {
//printf("calljs lambda\n");
//        if (env != nullptr && callback != nullptr) callback.Call(context->Value(), {Number::New(env, *data)});
//        if (data != nullptr) delete data;
//    };
        Context* ctx = new Napi::Reference<Napi::Value>(Napi::Persistent(info.This())); //rcvr = "this" of js cb func call
        using FinalizerDataType = void;
        const size_t UnlimQuelen = 0, NumThreads = 1; //queue len, thread count
        auto Finalizer = //[&bkg]( Napi::Env ) { bkg.join(); }; //finalizer used to clean up thread
            [&bkg](Napi::Env, FinalizerDataType*, Context* ctx) { debug(CYAN_MSG "finalizer"); /*bkg.join()*/; delete ctx; }; //finalizer used to clean up thread
        tsfn = TSFN::New(info.Env(), evth, "YALP frbuf evth", UnlimQuelen, NumThreads, ctx, Finalizer); //NOTE: can only be called from main thread
        bkg = std::thread([this, /*info, retval,*/ tsfn]
        {
//debug(CYAN_MSG "bkg thread started");
//            for (int i = 0; i < count; i++)
//            {
//                int *value = new int(clock());
//                napi_status status = tsfn.BlockingCall(value);
//                if (status != napi_ok) { printf("blk call failed\n"); break; } // Handle error
//                std::this_thread::sleep_for(std::chrono::seconds(1));
//            }
//    void emitfr(frbuf_t* fbptr)
            auto emitfr = [this, /*info, retval,*/ tsfn](shmdata_t::frbuf_t* fbptr = 0)
            {
//int fifo = fbptr? fbptr - &this->m_shmptr->frbufs[0]: -1;
//debug("upd loop call emitfr with fbptr@ %p => frbuf# %d", fbptr, fifo);
//if (this->m_shmptr->stats.numfr > 400) fbptr = 0;
                this->fremit.fbptr = fbptr;
//if (!fbptr) debug(CYAN_MSG "emit eof");
//                Napi::ObjectReference& frbuf_js = this->fbptr2napi(fbptr);
                napi_status ok = tsfn.BlockingCall(this); //&frbuf_js);
                if (ok == napi_ok) return;
fatal("upd loop js callback failed");
//                retval.Reject(err_napi(info.Env(), "call tsfn failed")); //TODO: is this safe?
                this->m_shmptr->cancel(-1); //quit if nobody is listening :(
            };
            napi_status ok; //= tsfn.Acquire(); //assertion fails; missing a function somewhere
//debug("tsfn acquired ok? %d", ok == napi_ok);
//            if (ok != napi_ok) RETURN(this->m_shmptr->cancel(-3)); //NOTE: must acquire from calling thread
            numfr_t numfr = this->m_shmptr->updloop(emitfr); //run on bkg thread so main thread doesn't block
debug("updloop ret with #fr %'d", numfr);
            try { ok = tsfn.Release(); debug(GREEN_MSG "tsfn rel ok"); }
            catch (...) { debug(RED_MSG "tsfn rel exc"); ok = napi_ok; } //ignore
//debug("tsfn released ok? %d", ok == napi_ok);
//            if (ok == napi_ok) return; //RETURN(this->m_shmptr->cancel(numfr)); //set loop result
//            if (ok != napi_ok) retval.Reject(err_napi(info.Env(), "tsfn rel failed")); //napi_invalid_arg         }); //(thread-count is 0) or napi_generic_failure
//            else retval.Resolve(Napi::Number::New(info.Env(), numfr)); //TODO: is this safe?
//            if ((ok != napi_ok) || !this->shmptr->stats.last_updloop) this->shmptr->cancel((ok != napi_ok)? -2: numfr); //set updloop result
            this->m_shmptr->cancel((ok == napi_ok)? numfr: -2); //set updloop result; NOTE: promise already fulfilled, but caller can check updloop status later
//{ m_defer.Resolve(...)
//{ m_def.Reject(error.Value()); }
        });
        bkg.detach();
//debug("created bkg thread, returning promise");
//        Napi::Object retval = promise.Promise();
//        fremit.ref = Napi::Persistent(retval); //promise.Promise());
//        return fremit.ref.Value();
        return fremit.promise.Promise();
    }
#endif //def USING_NAPI
    NAPI_EXPORT_METHOD(self_t, "updloop", /*m_ptr->*/updloop_method);
#ifdef USING_NAPI
    Napi::Value cancel_method(const Napi::CallbackInfo& info)
    {
//debug(RED_MSG "napi cancel");
        if (info.Length() > 1 || (info.Length() && !info[0].IsNumber())) return err_napi(info.Env(), "count/reason code (optional Number) expected, got %d: %s", info.Length(), NapiArgType(info, 0));
        int result = info.Length()? napi2val<int>(info[0]): 0;
        return Napi::Boolean::New(info.Env(), info.Length()? m_shmptr->cancel(result): m_shmptr->cancel());
    }
#endif //def USING_NAPI
    NAPI_EXPORT_METHOD(self_t, "cancel", /*m_ptr->*/cancel_method);
//shm:
//    int get_shmkey() { return SHMKEY; }
//    NAPI_EXPORT_PROPERTY(self_t, "SHMKEY", get_shmkey); //[]() { return NUMPORTS; });
    Napi::Value numatt_getter(const Napi::CallbackInfo &info) { return Napi::Number::New(info.Env(), decltype(m_shmptr)::numatt()); }
    NAPI_EXPORT_WRAPPED_PROPERTY(self_t, "num_att", numatt_getter);
    NAPI_STOP_EXPORTS(self_t); //public
public:
    YALP_shm() = delete;
    template <typename ... ARGS>
    YALP_shm(Napi::Env env, ARGS&& ... args): m_shmptr(std::forward<ARGS>(args) ...) //, fremit(env) //perfect fwd; explicitly call ctor to init
    {
        debug_noinfo("+----------------------------");
        debug_noinfo("| shm: key 0x%x, len %'lu", SHMKEY, sizeof(decltype(m_shmptr)::wrapped_t));
        debug_noinfo("| scr info@ %p: fbnum, xres, xtotal, yres, ytotal, pxclock", &m_shmptr->fbnum);
        debug_noinfo("| shm data@ %p: debug_level, bkgid, fifo, seqname[250], spare[200]", &m_shmptr->debug_level);
        debug_noinfo("| stats@ %p: numfr, busytime, emittime, idletime, last updloop", &m_shmptr->stats.numfr);
        debug_noinfo("| port[0/%d]@ %p: brlimit", SIZEOF(m_shmptr->ports) - 1, &m_shmptr->ports[0]);
        for (int f = 0; f < SIZEOF(m_shmptr->frbufs); ++f)
            debug_noinfo("| frbuf[%d]@ %p: seqnum, fr#/timestamp, nodes@ %p", f, &m_shmptr->frbufs[f], &m_shmptr->wsnodes[f][0][0]);
//        debug_noinfo("| sync@ %p: mtx, cv, init", &m_shmptr->m_shminit); //mtx);
        int len = m_shmptr->univlen(), maxlen = YALP::UNIV_MAXLEN; //SIZEOF(m_shmptr->wsnodes[0][0]);
        debug_noinfo("| nodes@ %p = %p, %d x %d x univ len %'d/%'d (%d%%)", &m_shmptr->wsnodes_poolmax[0], &m_shmptr->wsnodes[0][0][0], SIZEOF(m_shmptr->frbufs), SIZEOF(m_shmptr->ports), len, maxlen, rdiv(100 * len, maxlen));
        debug("| eoshm@ %p = %p", &m_shmptr->m_first + sizeof(decltype(m_shmptr)::wrapped_t), m_shmptr + 1);
//debug("nodes[0][0][0]@ %p vs %p %p %p %p", &m_shmptr->wsnodes_poolmax[0], &m_shmptr->wsnodes[0][0][0], &m_shmptr->wsnodes[0][0], &m_shmptr->wsnodes[0], m_shmptr->wsnodes);
//debug("nodes[0][0][1]@ %p [0][1][0] %p [1][0][0] %p", &m_shmptr->wsnodes[0][0][1], &m_shmptr->wsnodes[0][1][0], &m_shmptr->wsnodes[1][0][0]);
//debug("nodes[1][1][1]@ %p vs %p %p %p", &m_shmptr->wsnodes[1][1][1], &m_shmptr->wsnodes[1][1], &m_shmptr->wsnodes[1], m_shmptr->wsnodes + 1);
    }
    ~YALP_shm() {}
#ifdef USING_NAPI
//ctor with JS args:
//    Napi::Array frbufs_js;
    YALP_shm(const Napi::CallbackInfo& info): YALP_shm(info.Env(), opts_napi(info)) //, fremit(info.Env())
    {
//        debug("yalp napi ctor instantiate frbufs");
//        frbufs_js = frbufs_getter(info); //instantiate frbuf/port wrapper objs
//static properties that won't change don't need getters:
        Napi::Object me = info.This().As<Napi::Object>();
//scr/gpu info:
        me.Set("fbnum", m_shmptr->fbnum);
        me.Set("xres", m_shmptr->xres);
        me.Set("xtotal", m_shmptr->xtotal);
        me.Set("yres", m_shmptr->yres);
        me.Set("ytotal", m_shmptr->ytotal);
        me.Set("pixclock", m_shmptr->pxclock);
        me.Set("ppb", m_shmptr->ppb());
        me.Set("frtime", m_shmptr->frtime_usec());
        me.Set("NUM_UNIV", (int)YALP::NUMPORTS); //redundant
        me.Set("UNIV_LEN", m_shmptr->univlen());
//misc/config:
        me.Set("spares", /*Napi::Persistent*/(/*m_ptr->*/spares_getter(info))); //TODO: when to unref?
//ports:
        me.Set("NUM_PORTS", /*Napi::Number::New(info.Env(),*/ (int)YALP::NUMPORTS); //redundant
        for (int i = 0; i < SIZEOF(m_shmptr->ports); ++i) //YALP::NUMPORTS
            m_shmptr->ports[i].brlimit = 3 * 255 * 5/6; //default 83%; caller can override
        me.Set("ports", /*Napi::Persistent*/(/*m_ptr->*/ports_getter(info))); //TODO: when to unref?
//frbufs:
        me.Set("frbufs", /*Napi::Persistent*/(/*m_ptr->*/frbufs_getter(info))); //TODO: when to unref?
        me.Set("UNIV_MAXLEN", (int)/*frbuf_t::port_t*/YALP::UNIV_MAXLEN);
//shm:
        me.Set("SHMKEY", (int)SHMKEY);
        me.Set("XPARENT", (int)YALP::XPARENT); //redundant
    }
    static opts_t& opts_napi(const Napi::CallbackInfo& info)
    {
        static opts_t c_opts;
//debug("js ctor: %d args", info.Length());
        if (!info.Length()) return c_opts;
        if (info.Length() > 1 || (info.Length() && !info[0].IsObject())) { err_napi(info.Env(), "options (optional Object) expected; got: %d %s", info.Length(), NapiArgType(info, 0)); return c_opts; }
//https://github.com/nodejs/node-addon-api/blob/master/doc/object.md
//https://stackoverflow.com/questions/57885324/how-to-access-js-object-property-in-node-js-native-addon
//        std::string unknopt;
        const /*auto*/ Napi::Object napi_opts = info[0].As<Napi::Object>(); //.Value();
        Napi::Array names = napi_opts.GetPropertyNames();
        for (int i = 0; i < names.Length(); ++i)
        {
            std::string name = (std::string)names.Get(i).As<Napi::String>(); //.Get(names[i]).As<Napi::String>();
//            const char* cname = napi2val(names.Get(i));
//debug("yalp ctor opt[%d/%d] '%s' %s", i, names.Length(), name.c_str(), NapiType(napi_opts.Get(name))); //names[i])));
            if (!name.compare("fbnum")) c_opts.fbnum =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.fbnum)>(napi_opts.Get(name).As<Napi::Number>());
            else if (!name.compare("timing")) c_opts.timing_ovr = napi_opts.Get(name).ToString(); //coerce //napi2val<decltype(c_opts.timing_ovr)>(napi_opts.Get(name).As<Napi::String>());
            else if (!name.compare("debug")) c_opts.debug_level =  napi_opts.Get(name)/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce //napi2val<decltype(c_opts.debug_level)>(napi_opts.Get(name).As<Napi::Number>());
//            else unknopt += strprintf(", %s '%s'", NapiType(napi_opts.Get(name)), name.c_str());
            else warn("unknown YALP() option: %s '%s' (valid options: %s)", NapiType(napi_opts.Get(name)), name.c_str(), "fbnum, timing, debug");
        }
//        if (unknopt.length()) { err_napi(info.Env(), "unknown option%s: %s (allowed are: %s)", strchr(unknopt.c_str() + 2, ',')? "s": "", unknopt.c_str() + 2, "fbnum, timing, debug"); return c_opts; }
debug("ctor opts: fbnum %d, timing '%s', debug %d", c_opts.fbnum, c_opts.timing_ovr.c_str(), c_opts.debug_level);
        return c_opts;
    }
#endif //def USING_NAPI
};
NAPI_EXPORT_CLASS(YALP_shm, "YALP");


//allow JS to use my debug:
#ifdef USING_NAPI
//#pragma message(YELLOW_MSG "TODO: also fatal()")
Napi::Value jsdebug(const Napi::CallbackInfo& info)
{
    if ((info.Length() != 1) || !info[0].IsString()) return err_napi(info.Env(), "1 string expected; got %d %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()));
    const /*auto*/ std::string str = info[0].As<Napi::String>();
//    Napi::Env env = info.Env();
//kludge: make it look like debug() but tweak params a little
//    debug("%s", str.c_str());
//    if (str ends with @[^:]+:\d+ENDCOLOR\n?) truncate
//    const char* cstr = str.c_str();
//    const char* bp = strchr(cstr, "@");
//    const char* bp2 = strchr(bp, ':');
//    bool has_srcline = true; //TODO
//    prevout = printf("\n" BLUE_MSG "%s" BLUE_MSG "%s" "%s" ENDCOLOR_NEWLINE + (prevout > 0), str.c_str(), !has_srcline? SRCLINE: "", rti()); //TODO: fix color spread
//#define debug(...)  debug_maybe(BLUE_MSG __VA_ARGS__, thrinx(), (double)epoch.elapsed() / (int)1e3, SRCLINEF)
//#define debug_maybe(fmt, ...)  prevout = printf("\n" fmt " $%d T+%4.3f @%s" ENDCOLOR_NEWLINE + (prevout > 0), __VA_ARGS__)
    const char* buf = str.c_str();
    const char* bp = strrchr(buf, '@');
//    debug("%s", str.c_str());
    if (bp) //kludge: use JS srcline instead of mine
    {
//        const char* SRCLINEF = bp;
        ((char*)bp)[-1] = '\0';
#define strafter(...)  bp + 1
        debug("%s", buf);
#undef strafter
        ((char*)bp)[-1] = ' ';
    }
    else debug("%s", buf); //str.c_str());
    return info.Length()? info[0]: info.Env().Undefined(); //allow inline debug()
}


//redirect debug output to file:
//https://github.com/nodejs/node-addon-api/blob/master/doc/external.md
//int debout = stdout;
//decltype(debout) get_debout() { return debout; }
//void set_debout(decltype(debout) newout) { ... }
//#define NAPI_GETTER_3ARGS(cls, getter, wrapper_name)
//define NAPI_SETTER_4ARGS(cls, getter, setter, wrapper_name)
#include <stdio.h> //fdopen(), fileno()
Napi::Value debout_getter(const Napi::CallbackInfo& info)
{
//    fprintf(stderr, "got debout = %d\n", fileno(debout)); fflush(stderr);
    return Napi::Number::New(info.Env(), fileno(debout));
}
/*Napi::Value*/ void debout_setter(const Napi::CallbackInfo& info)
{
    if ((info.Length() != 1) || !info[0].IsNumber()) RETURN(err_napi(info.Env(), "1 number (file#) expected; got %d %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined())));
//    const /*auto*/ std::string str = info[0].As<Napi::String>();
    int fd = info[0].As<Napi::Number>().Int32Value();
//fprintf(stderr, "set debout = %d\n", fd);
    FILE* fp = fdopen(fd, "a");
    if (!fp) fatal("fdopen(%d) failed", fd);
//fprintf(stderr, "debug output redirected: file# %d -> %d\n", fileno(debout), fd); fflush(stderr);
    if (fflush(debout)) fatal("flush(%d) failed", fileno(debout)); //clean cut-over: flush output before changing destination
    debout = fp;
//    Napi::Env env = info.Env();
//    prevout = printf("\n" BLUE_MSG "%s" BLUE_MSG "%s" "%s" ENDCOLOR_NEWLINE + (prevout > 0), str.c_str(), 
//    return info[0];
}


//allow JS to use my elapsed/epoch:
//allows consistent time base between JS and C++
Napi::Value jselapsed(const Napi::CallbackInfo& info)
{
    if ((info.Length() > 1) || (info.Length() && !info[0].IsNumber())) return err_napi(info.Env(), "1 optional number (msec) expected; got %d %s", info.Length(), NapiType(info.Length()? info[0]: info.Env().Undefined()));
    using elapsed_t = decltype(epoch)::elapsed_t;
    elapsed_t time_base = info.Length()? napi2val<elapsed_t>(info[0]): 0; //msec
    elapsed_t retval = (double)epoch.elapsed() - time_base; //msec
    return Napi::Number::New(info.Env(), retval);
}
#endif //def USING_NAPI


//export some useful info:
//const info; doesn't need getters/setters
//make global so caller can use it before instantiating YALP()
static Napi::Object UsefulInfo(Napi::Env env, Napi::Object exports)
{
//env:
    exports.Set("isRPi", Napi::Number::New(env, isRPi));
//    exports.Set("noGUI", Napi::Number::New(env, noGUI));
//    exports.Set("isSSH", Napi::Number::New(env, isSSH));
//    exports.Set("isXTerm", Napi::Number::New(env, isXTerm));
    exports.Set("isXWindows", Napi::Number::New(env, isXWindows));
//config:
    exports.Set("NUM_PORTS", Napi::Number::New(env, YALP::NUMPORTS));
//nodes:
    exports.Set("XPARENT", Napi::Number::New(env, YALP::XPARENT));
//debug info:
    exports.Set("ccp_ctr", Napi::Number::New(env, __COUNTER__)); //debug: show #recursive templates used
//    exports.Set("thrinx", Napi::Number::New(env, thrinx())); //allow access to thread info without any object inst
    exports.Set("shm_size", Napi::Number::New(env, sizeof(YALP)));
    exports.Set("shmkey", Napi::Number::New(env, YALP_shm::SHMKEY));
    exports.Set("shm_desc", Napi::String::New(env, strprintf("key 0x%x, len %'d", YALP_shm::SHMKEY, sizeof(YALP)))); //more readble (for debug)
//    std::string pkg = readfile("./package.json");
//    std::size_t verofs = pkg.find("\"version\": \"");
//    std::size_t verofe = (verofs != std::string::npos)? pkg.find("\",", verofs + 11): std::string::npos;
//    exports.Set("version", Napi::String::New(env, (verofe != verofs)? pkg.substr(verofs, verofe - verofs): "?unknown?"));
    exports.Set("version", Napi::String::New(env, TOSTR(VERSION))); //from node.gyp
    exports.Set("built", Napi::String::New(env, TOSTR(BUILT))); //from node.gyp  __TIMESTAMP__)); //from gcc
//utils:
    Napi::PropertyDescriptor pd = Napi::PropertyDescriptor::Accessor<debout_getter, debout_setter>("debout", my_napi_default_prop);
    exports.DefineProperty(pd);
//wrong    exports.DefineProperties({Napi::PropertyDescriptor::Accessor<debout_getter, debout_setter>("debout")});
//    exports.SetAccessor("debout", debout_getter, debout_setter);
    exports.Set(/*Napi::String::New(env,*/ "jsdebug", Napi::Function::New(env, jsdebug)); //allow caller to use
    exports.Set(/*Napi::String::New(env,*/ "jselapsed", Napi::Function::New(env, jselapsed)); //allow caller to use
    return exports;
}
NAPI_EXPORT_MODULE(UsefulInfo);


NAPI_EXPORT_MODULES(); //export modules to Javascript


#elif _HOIST == HOIST_DATASTTR
 #undef _HOIST
#define _HOIST  HOIST_HELPERS
#include __FILE__  //error here requires CD into folder or add "-I." to compile
///////////////////////////////////////////////////////////////////////////////
////
/// shared mem sttrs: (hoisted above main)
//


//GPU timing + config info:
//#include <cstdio> //sscanf
#include <fcntl.h> //open(), O_RDWR
#include <sys/ioctl.h> //ioctl()
#include <stdexcept> //std::out_of_range(), std::runtime_error()
#include <linux/fb.h> //FBIO_*, struct fb_var_screeninfo, fb_fix_screeninfo
#include <string> //std::string
//template <int GPUBITS = 24>
//struct scrinfo
class scrinfo_t //: public AutoFB<>::timing_t
{
//        GET_SELF;
    using self_t = scrinfo_t;
public:
    char m_first; //dummy member for easier addr calculations
    CONSTDEF(GPUBITS, 24); //#bits in RGB value; restricted by RPi h/w
//    using PSEC2USEC = 1000000; //(int)1e6;
//    static constexpr int PSEC2USEC = (int)1e6;
//    enum { USEC2PSEC = (int)1e6 }; //1000000 };
    CONSTDEF(WSNODE_USEC, 30); //predetermined by WS281x protocol; fixed @30 usec/wsnode
    CONSTDEF(WSBITS, 24); //predetermined by protocol; fixed @24 bits/node
    CONSTDEF(NUMPORTS, GPUBITS); //each RGB bit (plane) becomes a WS281X port (via RPi dpi24)
//!worky    static constexpr auto get_numports = []() { return NUMPORTS; };
//    int get_numports() { return NUMPORTS; }
//    NAPI_EXPORT_PROPERTY(self_t, "NUMPORTS", get_numports); //[]() { return NUMPORTS; });
    using gpubits_t = uint32_t; // /*AutoFB::*/data_t; //uint32_t; //1 bit for each "port"; only 24 bits available in RGB value
    static_assert(GPUBITS <= bytes2bits(sizeof(gpubits_t)));
    static_assert(NUMPORTS <= GPUBITS);
    struct my_var_screeninfo: /*struct*/ fb_var_screeninfo
    {
        int fbnum; //tag screen info with FB device#
//add helpers:
        inline int xtotal() const { return xres + right_margin + hsync_len + left_margin; }
        inline int ytotal() const { return yres + lower_margin + vsync_len + upper_margin; }
        inline int frtime_usec() const { return (int)(double)pixclock * xtotal() / (int)1e3 * ytotal() / (int)1e3; } //psec -> usec; kludge: split up 1e6 factor to prevent overflow
        inline float fps() const { return (int)1e6 / frtime_usec(); }
    };
//    static constexpr int WSBITS = 24; //predetermined by protocol; 24 bits/node
    int fbnum = -1; //fb device#
//    int debug_level; //put this in here to allow select debug at this level
//    uint32_t width; //#univ/channels/planes
//    uint32_t height; //univ len; max #nodes 
//    AutoFB::timing_t gppinfo; //{xres, xtotal, yres, ytotal, pxclock};
    int xres, xtotal; //visible + total hres (incl blank/sync)
    int yres, ytotal; //visible + total vres (incl blank/sync)
    int pxclock; //pix clock (psec)
//    int rgbbits; //#R+G+B bits
    inline bool isvalid() const { return xtotal && ytotal && pxclock; }
//    inline int gaplen() const { return xtotal - xres; }
//scale allows caller to check exactness:
    inline int ppb(int scale = 1) const { return pxclock? usec2psec(WSNODE_USEC) / WSBITS * scale / pxclock: 0; } //        uint32_t frtime; //usec/frame; derive fps from this
    inline int frtime_usec() const
    {
        static decltype(frtime_usec()) cached = (int)(double)pxclock * xtotal / (int)1e3 * ytotal / (int)1e3; //usec; kludge: split up 1e6 factor to prevent overflow
//        if (frnum != -1) return cached * frnum / (int)1e3; //CAUTION: usec => msec
        if (!cached) fatal("frtime 0 usec: pxclock %'d, xtotal %'d, ytotal %'d", pxclock, xtotal, ytotal);
        return cached;
    }
    inline timer_t<(int)1e3>::elapsed_t frtime_msec(int frnum) const { return frtime_usec() * frnum / (int)1e3; } //CAUTION: usec => msec to extend range
    inline int frnum(timer_t<(int)1e3>::elapsed_t time_msec) const { return time_msec * (int)1e3 / frtime_usec(); }
    inline float fps() const { return (int)1e6 / frtime_usec(); }
    static constexpr int fps2nodes(int fps) { return (int)1e6 / fps / WSNODE_USEC; }
//max WS281X universe len with given screen resolution:
    inline size_t univlen(int reserved = -1) const
    {
        static int save_res = (reserved == -1)? fatal("univlen() missing req'd arg (first time only)"): reserved;
        if ((reserved != -1) && (reserved != save_res)) warn("reserved %d mismatches initial value %d, ignored", reserved, save_res);
        static decltype(univlen()) cached = (xtotal * yres - reserved) / WSBITS / ppb(); //NOTE: hblank counts because it interleaves visible data (bits will be 0 during hblank); vblank !counted because occurs after all node data (reset period)
        static bool valid = univlen_check(); //use "static" to check 1x
        return cached;
    }
//        size_t univ_len; //#ws nodes
//    struct fix_screeninfo scrf;
public: //ctor/dtor:
//no: require config!    timing() {}
//NOTE: caller *must* a select fb#; no default here
    scrinfo_t() { debug("scrinfo_t def ctor: IGNORED"); } //= delete; //don't allow implicit create (requires at least fb# to be meaningful)
//    struct NoInit {}; //kludge: special tag to instantiate without init
//    scrinfo_t(NoInit) {}
    scrinfo_t(int fbnum, int want_debug = 0): scrinfo_t(fbnum2info(fbnum, want_debug), want_debug) {}
    scrinfo_t(int fbnum, const char* timing, int want_debug = 0): scrinfo_t(timing_override(fbnum, timing, want_debug), want_debug) {}
    scrinfo_t(const struct my_var_screeninfo& scrv, int want_debug = 0): /*scrinfo_t(NoInit{}),*/ fbnum(scrv.fbnum), xres(scrv.xres), xtotal(scrv.xtotal()), yres(scrv.yres), ytotal(scrv.ytotal()), pxclock(scrv.pixclock) //, rgbbits(scrv.red.length + scrv.green.length + scrv.blue.length)
    {
        shm_singleton(this); //kludge: allow child frbuf, port objects to access container
//        debug("getting scr info for fb#%d", fbnum);
//        fbnum = scrv.fbnum;
//use, !save:        debug_level = want_debug;
//        xres = scrv.xres; xtotal = scrv.xtotal(); //right_margin + scrv.hsync_len + scrv.left_margin + xres = scrv->xres;
//        yres = scrv.yres; ytotal = scrv.ytotal(); //lower_margin + scrv.vsync_len + scrv.upper_margin + yres = scrv->yres;
//each YALP "universe" (port) of WS281X nodes is a GPU RGB bit plane:
        if (scrv.red.length + scrv.green.length + scrv.blue.length != GPUBITS) fatal("unsupported RGB config on FB#%d: %d+%d+%d = %d, expected %d", scrv.fbnum, scrv.red.length, scrv.green.length, scrv.blue.length, scrv.red.length + scrv.green.length + scrv.blue.length, GPUBITS);
        if (scrv.red.length != GPUBITS/3 || scrv.green.length != GPUBITS/3 || scrv.blue.length != GPUBITS/3) warn("strange RGB config on FB#%d: %d+%d+%d, expected %d each", scrv.fbnum, scrv.red.length, scrv.green.length, scrv.blue.length, GPUBITS/3);
//measure it anyway        if (scrv.pixclock) return;
//kludge: try to measure pix clock:
        AutoFB<>::timing_t timing(xres, xtotal, yres, ytotal, pxclock, true, false);
        AutoFB fb(fbnum, timing); //, AutoFB<>::NO_MMAP);
//debug("start");
        fb.wait4sync(); //wait until start of next frame to get clean stats
        timer_t<(int)1e6> clock; //no worky--NOTE: use nsec to detect timer wrap (validates NUMFR range)
        int frames = 0;
        CONSTDEF(NUMFR, 40); //CAUTION: elapsed time in usec must stay under ~ 2 sec to avoid overflow; 40 frames @60Hz ~= 667K, @30Hz ~= 1.3M, @20Hz == 2M usec
        while (frames++ < NUMFR) fb.wait4sync();
        decltype(clock)::elapsed_t elapsed_usec = clock.elapsed();
//debug("%'d vs. %'u usec elapsed", elapsed_usec, elapsed_usec);
//wrong        pxclock = (unsigned long long)/*clock.elapsed()*/elaps * (int)1e6 / NUMFR; //<(int)1e6>(started_usec) * 1e6 / NUMFR; //use long long for max accuracy
        decltype(pxclock) alt_pxclock = elapsed_usec * (int)1e3 / xtotal * (int)1e3 / ytotal / NUMFR; //usec => psec; kludge: split up 1e6 factor to prevent overflow
//debug("scr info %'u vs. %'d", scrv.pixclock, scrv.pixclock);
//debug("%'d vs. %'u psec pxclk", pxclock, pxclock);
//debug("%'d vs. %'u fr", NUMFR, NUMFR);
//debug("%'d vs. %'u usec elaps", pxclock * NUMFR / (int)1e3 * xtotal / (int)1e3 * ytotal, pxclock * NUMFR / (int)1e6);
debug("measured pix clock on fb#%d: %'u usec / %'d fr = %'u usec/fr = %'u psec/px (%'d KHz) vs scr info %'u (%'d KHz)", fbnum, elapsed_usec, NUMFR, elapsed_usec / NUMFR, alt_pxclock, psec2KHz(alt_pxclock), scrv.pixclock, psec2KHz(scrv.pixclock));
        if (!pxclock) pxclock = alt_pxclock; //use only if not already set
    }
//kludge: child (shmdata_t) needs singleton ptr < ctor/init, so put it in parent class where it will init first:
    static self_t*& shm_singleton(self_t* ptr = 0)
    {
        static self_t* m_ptr = ptr; //set first time only
//        debug(PINK_MSG "shmdata singleton@ %p -> %p", ptr, m_ptr);
        return m_ptr;
    }
//helpers:
    static struct my_var_screeninfo& fbnum2info(int fbnum, int want_debug = 0)
    {
        static struct my_var_screeninfo scrv;
        AutoFB fb(fbnum); //, AutoFB<>::NO_MMAP);
        if (!fb.isOpen()) fatal("can't open FB#%d", fbnum);
        if (ioctl(fb, FBIOGET_VSCREENINFO, &scrv) < 0) fatal("can't get screen var info");
        scrv.fbnum = fbnum; //tag with device#
        return scrv;
    }
//parse timing override (hdmi/dpi line from RPi /boot/config.txt):
    static struct my_var_screeninfo& timing_override(int fbnum, const char* str, int want_debug = 0)
    {
        struct my_var_screeninfo& scrv = fbnum2info(fbnum); //default values
        if (!str || !str[0]) return scrv; //use system-defined values
        int xres = 0, xsync = 0, xfront = 0, xback = 0;
        int yres = 0, yfront = 0, ysync = 0, yback = 0;
        int fps = 0, pxclock = 0;
        int ignore, polarity = 0, aspect = 0;
//RPi dpi_timings from /boot/config.txt
//example:  861 0 1 1 1  363 0 2 3 2  0 0 0  30 0 9600000 8
        const char* str_fixup = str_replace(str_replace(str_replace(str, "hdmi_timings="), "dpi_timings="), "\n").c_str();
        int nvals = ifnull(str)[0]? sscanf(str_fixup, " %d %d %d %d %d  %d %d %d %d %d  %d %d %d  %d %d %d %d ",
            &xres, &ignore, &xfront, &xsync, &xback,
            &yres, &ignore, &yfront, &ysync, &yback,
            &ignore, &ignore, &ignore, &fps, &polarity, &pxclock, &aspect): 0;
//printf("timing: nvals %d, str '%s'\n", nvals, ifnull(str, "(empty)"));
        if (/*nvals &&*/ (nvals != 17)) fatal("invalid timing: '%s' (found %d vals, expected 17)", str_fixup, nvals);
        int xtotal = xres + xfront + xsync + xback;
        int ytotal = yres + yfront + ysync + yback;
        if (!xtotal && !ytotal && !fps && !polarity && !clock) return scrv; //kludge: ignore junk entry: "0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 0 3"
        pxclock /= (int)1e3; //Hz => KHz
        if (!xres || !yres || !clock /*!isvalid()*/) fatal("invalid timing: '%s' (xres %d, yres %d, clock %d cannot be 0)", str_fixup, xres, yres, pxclock);
//no        xsync += xfront + xback; //consolidate for simpler calculations
//no        ysync += yfront + yback;
//        m_scrinfo.isvalid = true;
        debug("fb# %d config (before override): xres %'d, xtotal %'d, yres %'d, ytotal %'d", fbnum, scrv.xres, scrv.xtotal(), scrv.yres, scrv.ytotal());
        std::string changes;
#define UPDATE(old, new)  if (new != old) { changes += ", " #new; old = new; }
        UPDATE(scrv.xres, xres);
        UPDATE(scrv.left_margin, xfront);
        UPDATE(scrv.hsync_len, xsync);
        UPDATE(scrv.right_margin, xback);
        UPDATE(scrv.yres, yres);
        UPDATE(scrv.upper_margin, yfront);
        UPDATE(scrv.vsync_len, ysync);
        UPDATE(scrv.lower_margin, yback);
        UPDATE(scrv.pixclock, psec2KHz(pxclock)); //psec
#undef UPDATE
        if (fps != (int)scrv.fps()) warn("ignoring fps %d: doesn't match calculated fps %4.3f", fps, scrv.fps());
        if (!changes.length()) return scrv; //changes += ", (none)";
        warn("timing override fb#%d: xres %'d + %'d+%'d+%'d, yres %'d + %'d+%'d+%'d, fps %'d, clk %'d KHz, changed: %s", fbnum, xres, xfront, xsync, xback, yres, yfront, ysync, yback, fps, pxclock, changes.c_str() + 2);
        return scrv;
    }
//check for valid WS281x univ:
    bool univlen_check() const
    {
        bool warnings = 0;
        CONSTDEF(SCALE, 100); //enum { SCALE = 100 };
        CONSTDEF(WSFREQ, (int)2.4e3); //enum { WSFREQ = 2400 }; //2.4MHz gives 3 px/bit (simplest WS281X formatting)
//ppb checks: data streams use 1+1+1 format (3 px/bit, 2.4 MHz SPI-style)
        int ppb_check = ppb(SCALE);
        if (ppb_check % SCALE) warnings = warn("non-integral %3.2f px/bit results in timing jitter", (double)ppb_check / SCALE); //WSTIME * scrv.pixclock * (int)1e3 / WSBITS);
        ppb_check = rdiv(ppb_check, SCALE); //scale back to true value
        if (ppb_check < 3) fatal("ppb %d insufficient resolution to render WS281x data; must be >= 3", ppb_check);
#if 1 //Nov 2020: standardize on 3 ppb @2.4MHz (SPI-style) with 1 hblank bit; dev can still use this (windowed)
        if (ppb_check != 3) fatal("ppb %d !implemented; must be 3", ppb_check);
        if (xtotal - xres != 1) fatal("expected xtotal %'d = xres %'d + 1 for 3 ppb", xtotal, xres);
        if (pxclock != psec2KHz(WSFREQ)) fatal("pixclock %'d KHz !implemented; must be %'d KHz", psec2KHz(pxclock), WSFREQ);
//        if (gaplen != 1) fatal("gap len %d !implemented; should be 1", gaplen);
#endif
//misc other (res) checks:
        if (xres & 1) warnings = warn("non-even xres %'d can cause timing jitter (RPi GPU limitation)", xres);
        int vblank = ytotal - yres, xblank = xtotal - xres;
//    size_t univlen_pad = (((scrv.xtotal() * scrv.yres - NULLBITS) / WSBITS / m_ppb) * sizeof(wsnode_t) / CACHELEN) * CACHELEN / sizeof(wsnode_t); //bits -> bytes; minimize cache contention for mult-threaded apps
//        debug("WS281x univlen: (hres %'u + hblank %'u) * vres %'u = %'u bit times/ch/fr = %'d wsnode/ch/fr @%'d px/bit, pad %'d bytes => %'lu wsnodes/channel", 
//    "target limit %'d wsnodes/ch/fr (%'d bytes), "
//"bit clk %'lu KHz (%'d psec), hblank = %2.1f ws bits, vblank = %'d usec", 
//scrv.xres, scrv.xtotal() - scrv.xres, scrv.yres, scrv.xtotal() * scrv.yres, scrv.xtotal() * scrv.yres / WSBITS / m_ppb, m_ppb, CACHELEN, univlen_pad, 
//psec2KHz(scrv.pixclock), scrv.pixclock, (double)(scrv.xtotal() - scrv.xres) / m_ppb, (int)rdiv(scrv.xtotal() * vblank * scrv.pixclock, psec2usec));
//protocol limit: signal low (stop bit) must be < 50% data bit time
//this allows ws data stream to span hblank without interruption
        if (2 * xblank >= ppb_check) warnings = warn("hblank (%'d px) too long: exceeds WS281x 50%% data bit time (%'d px)", xtotal - xres, rdiv(ppb_check, 2));
        if (!vblank /*(xtotal * vblank) / scrv.pixclock / (int)1e3 < 50*/) warnings = warn("vblank (%'lu lines) too short: WS281x needs at least 50 usec (1 scan line)", vblank); //, 50e3 * scrv.pixclock / xtotal);
        if (xtotal % ppb_check) fatal("xtotal %'d must be a multiple of ppb %d", xtotal, ppb_check);
//        if (rowlen() != scrv.xres) errmsg("expected 0 pad len: rowlen %'d - xres %'d", rowlen(), scrv.xres);
//        if (!univlen || (univlen > limit)) /*return errmsg(99,*/ errmsg(YELLOW_MSG "univ length %'lu nodes outside expected range (0 .. %'d)", univlen, limit);
//adjust render logic to match screen config:
        return !warnings;
    }
//    static constexpr int fps2nodes(int fps) { return ((int)1e6 / (fps) / WSNODE_USEC); }
//RPi clock stored in KHz, XWindows pixclock stored in psec
//RPi 20 MHz (20K) <=> XWindows 50K psec (50K)
//use this macro to convert in either direction:
//#define psec2KHz(clk)  ((int)1e9 / (clk)) //(1e9 / (clk)) //((double)1e9 / clk)
    static constexpr int psec2KHz(int clk) { return (int)1e9 / clk; } //((double)1e9 / clk)
//#define usec2psec(usec)  ((usec) * (int)1e6)
    static constexpr int usec2psec(int usec) { return usec * (int)1e6; }
};
//using scrinfo_t = struct scrinfo;
//#define fps2nodes(fps)  scrinfo_t::fps2nodes(fps) //((int)1e6 / (fps) / scrinfo_t::WSNODE_USEC)


//shm sttr:
//holds config data + frbufs, anything that needs to be shared between threads/procs
//allows fast, efficient data sharing between JS threads and procs without IPC overhead
//JS renderers (providers) need to run well ahead of frbuf writer due to inprecise timing control in JS
//this allows atomics to be used instead of locks, which helps perf even more
//NOTE: some embedded sttrs will be exported as napi classes and used as JS proxies into overall sttr
//overridden "new" places napi proxy objects in shm
//#include <sys/mman.h> //mmap(), munmap()
#include <atomic> //std::atomic<>
//#include <sys/ipc.h> //IPC_*
//#include <sys/shm.h> //shmget(), shmat(), shmctl(), shmdt()
#include <type_traits> //std::remove_cvref<>
//#include <functional> //std::reference_wrapper<>
//#include <mutex> //std::mutex<>, std::unique_lock<>, std::lock_guard<>
//#include <condition_variable> //std::condition_variable<>
//template<int NUMBUF = 4> //, int UNIV_MAXLEN = scrinfo_t::fps2nodes(MIN_FPS), int MIN_FPS = 10>
//struct shmdata: /*public*/ scrinfo_t //struct scrinfo
class shmdata_t: public scrinfo_t
{
    using SUPER = scrinfo_t; //struct scrinfo;
//        GET_SELF;
    using self_t = shmdata_t;
//    shmdata_t* m_dummy = singleton(this); //kludge: must set singleton before frbuf + port ctors use it
public:
    CONSTDEF(NUMBUFS, 4);
//    CONSTDEF(SHMKEY, 0x59414C4F); //one shared copy; use "YALP" in ASCII
//    int get_shmkey() { return SHMKEY; }
//    NAPI_EXPORT_PROPERTY(self_t, "SHMKEY", get_shmkey); //[]() { return NUMPORTS; });
public: //properties
//    uint32_t nodeofs; //manifest: stofs of node data
//    int fbnum; //fb device#; -1 = undecided
//    scrinfo timing; //GPU config for frdev
    std::atomic<int> debug_level; //put this in here to allow select debug at global level
    std::atomic<int> bkgpid; //bkg process pid of FB update loop
    std::atomic<uint32_t> fifo; //first-used (oldest) frbuf; wraps to last-used (newest)
    char seqname[250]; //allow renderers to open new seq
    uint32_t spare[200]; //reserve general purpose memory for caller to use
//stats (read-only JS):
    struct
    {
        using numfr_t = uint32_t;
        std::atomic<numfr_t> numfr; //#frames drawn
//        using numfr_t = typename decltype(numfr)::value_type;
        std::atomic<uint32_t> busytime, emittime, idletime;
        std::atomic<uint32_t> last_updloop; //#frames or error from last upd loop
//atomic broken here; node can't find __atomic_store_16 in clear()
/*std::atomic<timer_t<(int)1e3>::timeval_t>*/ timer_t<(int)1e3>::timeval_t started; //start time (sec + usec)
//add more stats as needed
//methods:
        void clear()
        {
            numfr = busytime = emittime = idletime = last_updloop = 0;
//            elapsed<(int)1e6>(started); //started = latest_usec; }
            timer_t<(int)1e3> reset; /*elapsed<(int)1e3>(reset)*/; started = reset;
        }
        auto elapsed_msec() const { return timer_t<(int)1e3>(started).elapsed(); } //<(int)1e3>(copy); } //kludge: need writable copy for elapsed(); don't change shm copy
    } stats;
//    using numfr_t = typename decltype(stats.numfr)::value_type; // /*struct*/ stats.numfr::value_type;
//    using numfr_t = typename decltype(stats.numfr)::value_type;
//!needed; use getters/setters    using data_t = uint32_t; //use same data type for all port{} members so a typed array can be used
//ports:
//port info:
//a "port" is one GPIO pin, corresponding to one RGB bit (via dpi24)
//use atomics to reduce locking
//CAUTION: JS should use Atomic() to access port{} if multiple threads are active
//use getters/setters so caller has up-to-date values and/or can share across threads + procs
//fps determines max univ len + frbuf node array size
//for simpler code, a min fps is set at compile time and then actual value used at run-time
//#define MIN_FPS  10 //support down to 10 fps (largest univ)
//#include "napi-helpers.h" //misc napi defs
// /*typedef*/ struct
//template<int MIN_FPS = 10, int UNIV_MAXLEN = scrinfo_t<>::fps2nodes(MIN_FPS)>
//        struct alignas(CACHELEN) //port_t //reduce cache contention between threads
    class /*alignas(CACHELEN)*/ port_t //: public shmobj //reduce cache contention between threads
    {
//            GET_SELF;
        using self_t = port_t;
//members:
//            static inline shmdata_t& shdata() { static shmdata_t m_shdata(NoInit{}); return m_shdata; }
//            /*shmdata_t::frbuf_t::*/port_t& m_port;
    public: //types, consts
//            const size_t m_univlen;
    public: //ctors/dtors
//            port_t(port_t& other): m_port(other) //copy ctor
//            port_t() {} //debug_dedup((int)1e3, "port_t def ctor: IGNORED"); } //= delete; //no default ctor (needs port_t ref)
//            ~port_t() {}
//#ifdef USING_NAPI
//ignore args from JS ctor (already did shm init):
        port_t() //const Napi::CallbackInfo& info) //: frbuf_t(napi_args(info)) {}
        {
//                static shmdata_t& m_shdata = *(new shmdata_t(NoInit{})); //m_shdata(NoInit{});
            shmdata_t* m_shdata = shmdata_t::shm_singleton();
//verify this object is part of shm:
//            for (int i = 0; i < NUMBUFS; ++i)
                for (int u = 0; u < NUMPORTS; ++u)
                    if (this == &m_shdata->/*frbufs[i].*/ports[u]) return;
//                            RETURN(debug("port_t (proxy) ctor @%p: frbuf[%d], port[%d], shm @%p", this, i, u, &m_shdata));
fatal("port_t (proxy) ctor @%p: unkn frbuf, unkn port, shm @%p", this, &m_shdata);
        }
//#endif //def USING_NAPI
        static port_t* prealloc(port_t* newptr = 0) //TODO: use placement new instead
        {
            static port_t* m_ptr = 0;
            port_t* retval = m_ptr; m_ptr = newptr;
            return retval;
        }
    public: //properties
        /*std::atomic<int>*/ int brlimit; //one value per port avoids bulky node address checking; props on a port tend to be similar anyway; no need for atomic<>, caller should set 1x < playback
        int brlimit_load() { return brlimit; } //napi shim; emulate atomic<> methods
        void brlimit_store(int newlimit) { brlimit = newlimit; }
//            using brlimit_t = typename decltype(brlimit)::value_type;
//        std::atomic<size_t> /*dirtyofs,*/ dirtylen; //first + last dirty node ofs; allows data stream to be shortened on either end; more importantly, avoids unnecessary node updates in render threads
//            using dirty_t = typename decltype(dirtylen)::value_type;
//            NAPI_EXPORT_PROPERTY(self_t, "dirtyofs", dirtyofs.load, dirtyofs.store);
//            using wsnode_t = decltype(wsnodes[0]);
    } /*port_t*/ ports[NUMPORTS];
//        using port_t = myport_t; //typename std::remove_cvref<decltype(ports[0])>::type;
//TODO: export port inx and allow single port to be returned?  simpler for JS caller but more overhead in here
//frbufs:
//    struct //frbuf_t
//COW poor multi-threaded perf: https://www.drdobbs.com/cpp/c-string-performance/184405453
    class frbuf_t //: public shmobj
    {
//        GET_SELF;
        using self_t = frbuf_t;
//members:
//        static inline shmdata_t& shdata() { static shmdata_t m_shdata(NoInit{}); return m_shdata; }
//        /*shmdata_t::frbuf_t*/ self_t& m_shared;
    public: //ctors/dtors
//        frbuf_t(frbuf_t& other): m_frbuf(other) //copy ctor
//        frbuf_t() {} //debug("frbuf_t def ctor: IGNORED"); } //= delete; //no default ctor (needs frbuf_t ref)
//        ~frbuf_t() {}
//#ifdef USING_NAPI
//ignore args from JS ctor (already did shm init):
        frbuf_t() //const Napi::CallbackInfo& info) //: frbuf_t(napi_args(info)) {}
        {
//            static shmdata_t& m_shdata = *(new shmdata_t(NoInit{})); //m_shdata(NoInit{});
            shmdata_t* m_shdata = shmdata_t::shm_singleton();
//verify this object is part of shm:
            for (int i = 0; i < NUMBUFS; ++i)
                if (this == &m_shdata->frbufs[i]) return;
//                    RETURN(debug("frbuf_t (proxy) ctor @%p: frbuf[%d], shm @%p", this, i, &m_shdata));
fatal("frbuf_t (proxy) ctor @%p: unkn frbuf, shm @%p", this, &m_shdata);
        }
//#endif //def USING_NAPI
        static frbuf_t* prealloc(frbuf_t* newptr = 0) //TODO: use placement new instead
        {
            static frbuf_t* m_ptr = 0;
            frbuf_t* retval = m_ptr; m_ptr = newptr;
            return retval;
        }
    public: //properties
        using seqnum_t = uint32_t;
        std::atomic<seqnum_t> seqnum; //cycle#/song#; bump when rewinding timestamp
//        using seqnum_t = typename decltype(seqnum)::value_type;
//        std::atomic<timer_t<(int)1e3>::elapsed_t> timestamp; //when to show this frame rel to seq start (msec); wraps @~1.2 hr
        using frnum_t = uint32_t;
        std::atomic<frnum_t> frnum; //fr#
//        using frnum_t = typename decltype(frnum)::value_type;
//                shmdata_t* m_shdata = shmdata_t::shm_singleton();
        using timestamp_t = timer_t<(int)1e3>::elapsed_t; //typename decltype(timestamp)::value_type;
        inline timestamp_t timestamp(int relfrnum = 0) { return shmdata_t::shm_singleton()->frtime_msec(frnum + relfrnum); } //when to show this frame rel to seq start (msec); wraps @~1.2 hr
    } /*frbuf_t*/ frbufs[NUMBUFS];
//nodes:
    CONSTDEF(MIN_FPS, 10);
    CONSTDEF(UNIV_MAXLEN, scrinfo_t::fps2nodes(MIN_FPS));
    using wsnode_t = uint32_t; //need at least 24 bits
    using univnodes_t = ary<shmdata_t, wsnode_t>;
    using portnodes_t = ary<shmdata_t, univnodes_t, wsnode_t>;
    using frbufnodes_t = ary<shmdata_t, portnodes_t, wsnode_t>;
//    wsnode_t wsnodes_max[NUMBUFS][NUMPORTS][UNIV_MAXLEN]; //start of WS node data; CAUTION: frbuf ports are packed to actual univlen(); TODO: dyn alloc size based on fps/univlen
    wsnode_t wsnodes_poolmax[NUMBUFS * NUMPORTS * UNIV_MAXLEN]; //start of WS node data; CAUTION: frbuf ports are packed to actual univlen(); TODO: dyn alloc size based on fps/univlen
//    wsnode_t wsnodes[NUMBUFS][NUMPORTS][UNIV_MAXLEN];
//    using univ_t = wsnode_t[UNIV_MAXLEN];
//    univ_t& wsnodes[NUMBUFS][NUMPORTS];
//    std::reference_wrapper<univ_t> wsnodes[NUMBUFS][NUMPORTS] = {a,b,c};
//    univ_t&[NUMBUFS][NUMPORTS]
    frbufnodes_t& wsnodes; //3D pixel array access; at() bounds check, "[]" no bounds check
    CONSTDEF(XPARENT, 0); //use node color from previous frame
public: //ctor/dtor
    static inline self_t* shm_singleton() { return (self_t*)SUPER::shm_singleton(); }
//shm init to 0 when alloc; don't need ctor/dtor?
    shmdata_t() = delete; //{ debug("shmdata_t def ctor: IGNORED"); } //= delete; //don't allow implicit create (requires at least fb# to be meaningful)
//    struct NoInit {}; //kludge: special tag to instantiate without init
//    shmdata_t(NoInit): SUPER(SUPER::NoInit{}) {}
    shmdata_t(int fbnum, int want_debug = 0): shmdata_t(fbnum, NULL, want_debug) {} //, wsnodes(*(frbufnodes_t*)&wsnodes_poolmax[0])
    shmdata_t(int fbnum, const char* timing_ovr, int want_debug = 0, int univres = 0): SUPER(fbnum, timing_ovr, want_debug), debug_level(want_debug), wsnodes(*(frbufnodes_t*)&wsnodes_poolmax[0])
    {
        univlen(univres); //CAUTION: need to do this before using univlen()
//        if (m_mtx.islocked()) fatal("shm mtx failed to init?");
//CAUTION: need to set these before accessing wsnodes[]:
        frbufnodes_t::m_limit = portnodes_t::m_limit = univnodes_t::m_limit = wsnodes_poolmax + NUMBUFS * NUMPORTS * univlen();
        frbufnodes_t::m_len = NUMBUFS * (portnodes_t::m_len = NUMPORTS * (univnodes_t::m_len = univlen()));
    }
//    static shmdata_t*& singleton() { static shmdata_t* ptr = 0; debug(PINK_MSG "shmdata singleton@ %p", ptr); return ptr; }
//#ifdef USING_NAPI
//JS ctor
//    shmdata_t(const Napi::CallbackInfo& args): 
//#endif //def USING_NAPI
public: //fifo methods:
    inline frbuf_t* fbptr(int n) const { return (frbuf_t*)&frbufs[n % NUMBUFS]; }
    inline frbuf_t* newest() const { return fbptr(fifo + NUMBUFS - 1); } //get newest frbuf (tail of queue)
    inline frbuf_t* oldest() const { return fbptr(fifo); } //get oldest frbuf (head of queue)
    inline frbuf_t* dequeue() { return fbptr(fifo++); } //fifo.compare_exchange_weak(svfifo, svfifo + 1, std::memory_order_relaxed, std::memory_order_relaxed)); //move frbuf from que head to tail; onlg bkg thread should do this, but use atomic update just in case
//static_assert(sizeof(frbuf_t::seqnum_t) == 4);
//frbuf provider/consumer thread sync:
    ShmMutex m_mtx; //std::mutex m_mtx; //avoid mutex locks except when waiting; //PTHREAD_MUTEX_INITIALIZER?
//    using PROVIDER_LOCKTYPE = typename ShmMutex::write_lock; //std::lock_guard<decltype(m_mtx)>;
//    using CONSUMER_LOCKTYPE = typename ShmMutex::read_lock; //std::unique_lock<decltype(m_mtx)>; //not: std::lock_guard<decltype(m_mtx)>;
    ShmCondVar m_cv; //std::condition_variable m_cv;
//find first frbuf !older than specified time for given seq#:
    frbuf_t* newer(typename frbuf_t::seqnum_t want_seq, typename frbuf_t::timestamp_t min_time) const
    {
//debug("newer: look for seq# %'d, time >= %'d, frbufs %d: %d/%d, %d/%d, %d/%d, %d/%d", want_seq, min_time, fifo.load(), fbptr(0)->seqnum.load(), fbptr(0)->timestamp(), fbptr(1)->seqnum.load(), fbptr(1)->timestamp(), fbptr(2)->seqnum.load(), fbptr(2)->timestamp(), fbptr(3)->seqnum.load(), fbptr(3)->timestamp());
        for (int svfifo = fifo, i = svfifo; i < svfifo + NUMBUFS; ++i) //CAUTION: fifo could change during loop; use saved fifp head
        {
            frbuf_t* frbuf = fbptr(i); //= &frbuf[i % NUMBUFS];
//if ((frbuf->seqnum != want_seq) || (frbuf->timestamp() >= min_time)) debug("use %d? %d %d", i, frbuf->seqnum != want_seq, frbuf->timestamp() >= min_time);
            if (frbuf->seqnum != want_seq) return frbuf; //allow caller to detect stale seq# (no more bufs)
            if (frbuf->timestamp() >= min_time) return frbuf; //first (oldest) match
        }
        return 0; //all frbuf in use; caller needs to wait (polling for now); TODO: add IPC wakeup?
    }
#if 1
//blocking version for async JS:
//CAUTION: do not call on fg JS thread (due to blocking)
//    int wait4frbuf(typename frbuf_t::seqnum_t want_seq, typename frbuf_t::timestamp_t min_time) const
    frbuf_t* wait4newer(typename frbuf_t::seqnum_t want_seq, typename frbuf_t::timestamp_t min_time) //const
    {
        debug("renderer wait4newer: seq %'u, timest %'u", want_seq, min_time);
        if ((want_seq > 100) || (min_time > (int)300e3)) fatal("suspicious wait4newer: seq %'u, timest %'u", want_seq, min_time); //probably a bug
        decltype(m_mtx)::CONSUMER_LOCKTYPE lock(m_mtx); //req'd even for atomic vars
        for (;;)
        {
            frbuf_t* fbptr = newer(want_seq, min_time);
if (fbptr && fbptr != &frbufs[0] && fbptr != &frbufs[1] && fbptr != &frbufs[2] && fbptr != &frbufs[3]) fatal("inv frbuf ptr@ %p", fbptr);
//if (fbptr) debug("got newer? %d, newer is fb# %'lu, timest %'d, newest is fb# %d, timest %'d", !!fbptr, fbptr? fbptr - &frbufs[0]: -1, fbptr? fbptr->timestamp(): -1, newest() - &frbufs[0], newest()->timestamp());
            if (fbptr) return fbptr; //- &frbufs[0];
//            fbptr = newest();
//            debug("no frbuf available, newest is %'d:%'d, wait4newer", fbptr->seqnum.load(), fbptr->timestamp());
            m_cv.wait(lock); //wait for new frbuf; NOTE: need to filter spurious wakeups
        }
    }
#endif
//invalidate + recycle *all* frbufs:
//head of queue remains as-is (no need to reset it)
//static_assert(sizeof(frbuf_t::seqnum_t) == 4);
    CONSTDEF(BLACK, 0xFF000000);
    void recycle(typename frbuf_t::seqnum_t seqnum)
    {
//        bool move_last = (seqnum == (seqnum_t)-1); //frbuf[fifo % NUMBUFS].seqnum == seqnum);
        /*if (!move_last)*/ bkgpid = 0; //stop bkg upd loop
        for (int svfifo = fifo, i = svfifo; i < svfifo + NUMBUFS; ++i) //bkg loop is only thread that will modify fifo head, but use saved copy just in case
        {
            frbuf_t& frbuf = *fbptr(i); //fbptr = &frbuf[i % NUMBUFS];
            typename frbuf_t::seqnum_t oldseq = frbuf.seqnum;
            typename frbuf_t::timestamp_t oldtimest = frbuf.timestamp();
//            for (int u = 0; u < NUMPORTS; ++u)
//                /*frbuf.ports[u].first_dirty =*/ frbuf.ports[u].dirtylen = 0;
            frbuf.seqnum = seqnum;
//            frbuf.timestamp = frtime_msec(i - svfifo); //* frtime / (int)1e3; //msec; rewind to start next seq
            frbuf.frnum = i - svfifo;
            memset<wsnode_t>(&wsnodes[i % NUMBUFS][0][0], (i - svfifo == NUMBUFS - 1)? BLACK: XPARENT, &wsnodes[1][0][0] - &wsnodes[0][0][0]); //NUMPORTS * univlen()); //sizeof(wsnodes[0]) / sizeof(wsnode_t)); //initialize to xparent; simulates node copy-on-write; TODO: let caller do this (or choose to preserve)?
//debug("recycle[%d/%d]: seq# %'u => %'u, timest %'u => %'u", i, svfifo + NUMBUFS, oldseq, frbuf.seqnum.load(), oldtimest, frbuf.timestamp()); //NOTE: need to use .load() for atomics in printf()
        }
    }
};
//"c++filt <mangled_name>" to demangle
//CAUTION: static class members need init value in order to be found; overwrite later
template<> STATIC decltype(shmdata_t::univnodes_t::m_len) shmdata_t::univnodes_t::m_len = 0;
template<> STATIC decltype(shmdata_t::univnodes_t::m_limit) shmdata_t::univnodes_t::m_limit = 0;
template<> STATIC decltype(shmdata_t::univnodes_t::item_type) shmdata_t::univnodes_t::item_type = "univ nodes";
template<> STATIC decltype(shmdata_t::portnodes_t::m_len) shmdata_t::portnodes_t::m_len = 0;
template<> STATIC decltype(shmdata_t::portnodes_t::m_limit) shmdata_t::portnodes_t::m_limit = 0;
template<> STATIC decltype(shmdata_t::portnodes_t::item_type) shmdata_t::portnodes_t::item_type = "port nodes";
template<> STATIC decltype(shmdata_t::frbufnodes_t::m_len) shmdata_t::frbufnodes_t::m_len = 0;
template<> STATIC decltype(shmdata_t::frbufnodes_t::m_limit) shmdata_t::frbufnodes_t::m_limit = 0;
template<> STATIC decltype(shmdata_t::frbufnodes_t::item_type) shmdata_t::frbufnodes_t::item_type = "frbuf nodes";


#elif _HOIST == HOIST_HELPERS
 #undef _HOIST
#define _HOIST  HOIST_UTILS
#include __FILE__  //error here requires CD into folder or add "-I." to compile
///////////////////////////////////////////////////////////////////////////////
////
/// higher level defs + helpers (will be hoisted above main()
//


//export C++ classes/objects to Javascript (non-intrusive):
//#ifdef NODE_GYP_MODULE_NAME //defined by node-gyp
 #include "napi-helpers.h"
//#else //stand-alone compile; no Javascript
// #define NAPI_START_EXPORTS(...)  //noop
// #define NAPI_EXPORT_PROPERTY(...)  //noop
// #define NAPI_EXPORT_WRAPPED_PROPERTY(...)  //noop
// #define NAPI_EXPORT_METHOD(...)  //noop
// #define NAPI_STOP_EXPORTS(...)  //noop
// #define NAPI_EXPORT_CLASS(...)  //noop
// #define NAPI_EXPORT_OBJECT(...)  //noop
// #define NAPI_EXPORT_MODULES(...)  //noop
//#endif //def NODE_GYP_MODULE_NAME
//#ifdef NODE_GYP_MODULE_NAME
// #pragma message("compiled as Node.js add-on")
//#else
// #pragma message("compiled for stand-alone usage")
//#endif


//get RGB color components:
//NOTE: caller always uses ARGB byte order (for simplicity)
#define A(color)  cbyte(color, 24) //(((color) >> 24) & 0xFF) //Ashift)
#define R(color)  cbyte(color, 16) //(((color) >> 16) & 0xFF) //Rshift)
#define G(color)  cbyte(color, 8) //(((color) >> 8) & 0xFF) //Gshift)
#define B(color)  cbyte(color, 0) //(((color) >> 0) & 0xFF) //Bshift)
#define brightness(color)  (R(color) + G(color) + B(color)) //approximation; doesn't use HSV space (for perf)

#define Abits(color)  ((color) & 0xFF000000) //cbyte(color, -24) //-Ashift)
#define RGBbits(color)  ((color) & 0x00FFFFFF) //((color) & ~ABITS(0xFFffffff))
#define Rbits(color)  ((color) & 0x00FF0000) //cbyte(color, -16) //-Rshift)
#define Gbits(color)  ((color) & 0x0000FF00) //cbyte(color, -8) //-Gshift)
#define Bbits(color)  ((color) & 0x000000FF) //cbyte(color, -0) //-Bshift)


//misc env info:
//these won't change, so just store them as consts:
#include <cstdio> //fileno()
#include <unistd.h> //isatty()
#include <stdlib.h> //getenv()
const bool noGUI = isatty(fileno(stdin)); //https://stackoverflow.com/questions/13204177/how-to-find-out-if-running-from-terminal-or-gui
const bool isXWindows = !!getenv("DISPLAY");
const bool isXTerm = !!getenv("TERM");
const bool isSSH = !!getenv("SSH_CLIENT");
const bool isRPi = fexists("/boot/config.txt"); //use __arm__ or __ARMEL__ macro instead?


//SDL helpers:
//https://wiki.libsdl.org/CategoryAPI
#ifdef HAS_SDL //set by binding.gyp if detected
// #pragma message(CYAN_MSG "using SDL2 to emulate FB; TODO: clean this up" ENDCOLOR_NOLINE)
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
 inline bool SDL_OK_1ARG(SDL_Window* wnd) { return wnd || SDL_OK_1ARG(SDL_NotOK); }
 inline bool SDL_OK_1ARG(SDL_Renderer* rend) { return rend || SDL_OK_1ARG(SDL_NotOK); }
 inline bool SDL_OK_1ARG(SDL_Texture* txtr) { return txtr || SDL_OK_1ARG(SDL_NotOK); }
//use macro to handle optional message/printf:
 #define SDL_OK(...)  UPTO_10ARGS(__VA_ARGS__, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_3ORMORE, SDL_OK_2ARGS, SDL_OK_1ARG) (__VA_ARGS__)
//#define SDL_OK_1ARG(errcode)  ((SDL_LastError = (errcode)) >= 0)
 #define SDL_OK_2ARGS(result, str)  (SDL_OK_1ARG(result) || (fatal(str ": %s (%'d)", SDL_GetError(), SDL_LastError), false))
 #define SDL_OK_3ORMORE(result, fmt, ...)  (SDL_OK_1ARG(result) || (fatal(fmt ": %s (%'d)", __VA_ARGS__, SDL_GetError(), SDL_LastError), false))
//#else //no SDL
// #define IF_SDL(...)  //noop
// #define SDL_OK(...)  true
//dummy sttrs to reduce #ifdefs:
// struct SDL_Window {};
// struct SDL_DisplayMode {};
// struct SDL_Renderer {};
// struct SDL_Texture {};
// #define SDL_GetError()  "(no SDL)"
// #define SDL_SetError(...)  //noop
//#endif //def HAS_SDL


//SDL window wrapper:
//emulates FB memory using SDL window
//NOTE: caller always sees ARGB byte order; FB class will swap byte order internally if needed
//#define LAZY_TEXTURE //don't create until caller uses pixels
#include <stdlib.h> //getenv()
#include <cstdio> //sscanf(), snprintf()
#include <cstring> //memset()
#include <map> //std::map<>
//#define SDL_MAIN_HANDLED
#include <SDL.h> //SDL_*
class DevWindow
{
    SDL_Window* sdl_window = 0;
//    SDL_DisplayMode sdl_mode; //= {0}; //CAUTION: do not re-init after calling FB delegated ctor
    SDL_Renderer* sdl_renderer = 0;
    SDL_Texture* sdl_texture = 0;
    uint32_t* m_pixels = 0;
    size_t m_width = 0, m_height = 0;
    bool m_dirty = false;
    struct gpuinfo_t { int xres, xtotal, yres, ytotal, pxclock, want_vis; };
public:
    DevWindow(int xres, int xtotal, int yres, int ytotal, int pxclock, bool want_vis)
    {
        gpuinfo_t gpuinfo;
        gpuinfo.xres = xres;
        gpuinfo.xtotal = xtotal;
        gpuinfo.yres = yres;
        gpuinfo.ytotal = ytotal;
        gpuinfo.pxclock = pxclock;
        gpuinfo.want_vis = want_vis;
        get_canvas(gpuinfo);
    }
    ~DevWindow() { drop_canvas(); }
public: //props
    uint32_t* pxbuf() const { return m_pixels; }
    size_t width() const { return m_width; }
    size_t height() const { return m_height; }
    inline void dirty(bool newval) { if (this) m_dirty = newval; }
    inline bool dirty() const { return this? m_dirty: false; }
public: //methods
    inline bool wait4sync() { return update(); } //fatal() already called if failed
private: //helpers
//friendlier names for SDL special param values:
//  CONSTDEF(UNUSED, 0);
    CONSTDEF(DONT_CARE, 0);
    static constexpr SDL_Rect* ENTIRE_RECT =  NULL;
    CONSTDEF(DEFAULT_DRIVER, 0);
    CONSTDEF(FIRST_RENDERER_MATCH, -1);
    bool get_canvas(gpuinfo_t& scrv)
    {
        const bool want_vis = scrv.want_vis; //true;
//        debug("!try sdl? 0x%x ... using SDL on XW", !CFG.isXWindows());
//        debug("sdl_init");
//        SDL_SetMainReady();
        if (!SDL_OK(SDL_Init(SDL_INIT_VIDEO), "SDL_Init video")) return false;
        if (!SDL_OK(SDL_SetHint(SDL_HINT_RENDER_VSYNC, "1"), "SDL_SetHint VSYNC")) return false; //use video sync to avoid tear
        if (!SDL_OK(SDL_SetHint(SDL_HINT_RENDER_DRIVER, "RPI"), "SDL_SetHint RPI")) return false; //in case RPI is not first on list
        int dispinx = 0; //default first screen (for XWindows only)
        sscanf(ifnull(getenv("DISPLAY"), ":0"), ":%d", &dispinx); //use current display
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
//        debug("video drvr '%s', fmt %s, disp %'d x %'d vs. screen %'d x %'d", ifnull(SDL_GetCurrentVideoDriver(), "(none)"), PixelFormat(sdl_mode.format), sdl_mode.w, sdl_mode.h, scrv.xres, scrv.yres); //should match "tvservice -s"
//        decltype(m_scrinfo.var)& vs = m_scrinfo.var; //reduce verbosity
        switch (/*SDL_BITSPERPIXEL*/(sdl_mode.format))
        {
            case SDL_PIXELFORMAT_RGB888:
            case SDL_PIXELFORMAT_ARGB8888:
//                scrv.transp.length = scrv.red.length = scrv.green.length = scrv.blue.length = 8;
//                scrv.transp.offset = 24; scrv.red.offset = 16; scrv.green.offset = 8; scrv.blue.offset = 0;
//                if (SDL_BITSPERPIXEL(sdl_mode.format) < 32) scrv.transp.length = 0;
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
                fatal("unsupported pixel format: %s (%0x)", PixelFormat(sdl_mode.format), sdl_mode.format);
                return false;
        }
//for XWindows (dev), use upper right part of screen; else use entire screen
//kludge: RenderPresent !worky with hidden window, so create small (10 x 10) window
        if (scrv.xtotal == scrv.xres) warn("no xblank?  xres %'d, xtotal %'d", scrv.xres, scrv.xtotal); //caller should be using xtotal = xres + 1
        const int W = want_vis? MIN(scrv.xtotal, sdl_mode.w): 10; //DONT_CARE; //xres; //xres would be closest to actual RPi framebuf; instead, show xblank (for debug); pivot gaps should compensate
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
//        if (want_vis)
        {
            if ((sdl_mode.w != scrv.xres) || (sdl_mode.h != scrv.yres))
            {
                if (want_vis) warn("SDL window size %'d x %'d != screen size %'d x %'d", sdl_mode.w, sdl_mode.h, scrv.xres, scrv.yres);
                snprintf(title + strlen(title), sizeof(title) - strlen(title), " (not %'d x %'d)", scrv.xres, scrv.yres);
            }
//override FB info with SDL info:
            scrv.xtotal = sdl_mode.w; //+= sdl_mode.w - scrv.xres; //try to preserve gap size (caller should be using gap = 1)
//            scrv.xres = sdl_mode.w;
            scrv.yres = sdl_mode.h;
//            scrf.smem_len = sdl_mode.h * (scrf.line_length = sdl_mode.w * sizeof(m_pixels[0]));
        }
        (void)SDL_SetWindowTitle(sdl_window, title);
//        scrv.bits_per_pixel = SDL_BITSPERPIXEL(sdl_mode.format);
        debug("sdl window@ 0x%p, renderer@ %p: title '%s', fmt %s, %'d x %'d", sdl_window, sdl_renderer, title, PixelFormat(sdl_mode.format), sdl_mode.w, sdl_mode.h);
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
        debug("sdl renderer@ 0x%p: name '%s', max %'d x %'d, flags %s (0x%x), %d fmts: %s", sdl_renderer, rinfo.name, rinfo.max_texture_width, rinfo.max_texture_height, RendererFlags(rinfo.flags), rinfo.flags, rinfo.num_texture_formats, fmts.c_str() + 1);
#ifndef LAZY_TEXTURE
//don't need texture until caller uses pixels: -wrong, need it for get_pixclock also?
        constexpr int acc = SDL_TEXTUREACCESS_STATIC; //_STREAM?; //don't need to lock if using separate pixel array + VSYNC?
//errmsg(PINK_MSG "SDL_CreateTexture");
        if (!SDL_OK(sdl_texture = SDL_CreateTexture(sdl_renderer, SDL_PIXELFORMAT_ARGB8888, acc, scrv.xtotal, scrv.yres), "SDL_CreateTexture %'d x %'d", scrv.xres, scrv.yres)) return false; //make texture match FB memory (window matches visible portion only)
//        debug("got txtr @%p %'d x %'d", sdl_texture, scrv.xres, scrv.yres);
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
        m_width = scrv.xtotal; //preserve gap in memory
        m_height = scrv.yres;
//        size_t numpx = scrv.xres * scrv.yres; // * sizeof(m_pixels[0]);
        m_pixels = new uint32_t[m_width * m_height];
        if (!m_pixels) fatal("alloc pixel buf %'d x %'d (%'d qb total) failed", scrv.xres, scrv.yres, m_width * m_height);
        memset(m_pixels, 0, m_width * m_height * sizeof(m_pixels[0]));
        return true;
    }
    bool update()
    {
        if (!this) fatal("no SDL dev window");
        m_dirty = true; //kludge: RenderPresent() wants something to render
        if (m_dirty)
        {
//debug("here1, sdl_renderer@ %p", sdl_renderer);
            if (!sdl_renderer) fatal("no renderer");
            if (!SDL_OK(SDL_RenderClear(sdl_renderer), "SDL_RenderClear")) return false; //SDL wiki says to do this even if all pixels will be updated
//debug("here2");
            if (!m_pixels) fatal("no pixel buf");
            if (!sdl_texture) fatal("no texture");
//NOTE: rowlen likely > xres (caller wants it that way); this is okay if SDL clips
//debug("upd txtr @%p: w %'d * sizeof %d", sdl_texture, m_width, sizeof(m_pixels[0]));
            /*if (dirty)*/ if (!SDL_OK(SDL_UpdateTexture(sdl_texture, ENTIRE_RECT, m_pixels, m_width * sizeof(m_pixels[0])), "SDL_UpdateTexture row len %'lu", m_width * sizeof(m_pixels[0]))) return false;
//debug("here3");
//NOTE: RenderPresent doesn't seem to do anything unless something was updated
            if (!SDL_OK(SDL_RenderCopy(sdl_renderer, sdl_texture, ENTIRE_RECT, ENTIRE_RECT), "SDL_RenderCopy")) return false;
//debug("here4");
//if (count++ < 10) debug(PINK_MSG "SDL_RenderPresent");
            m_dirty = false;
        }
        if (!sdl_renderer) fatal("no renderer");
//debug("here5");
        (void)SDL_RenderPresent(sdl_renderer); //waits for VSYNC
        return true; //success
    }
    void drop_canvas()
    {
//        if (!isXWindows()) return;
//        if (fd != FAKED_FD) return errmsg(-1, "unknown close file: %d (wanted FB %d)", fd, FAKED_FD);
//        debug("close sdl dev window@ %p, renderer@ %p: pxbuf %p, txtr %p, sdl_quit", sdl_window, sdl_renderer, m_pixels, sdl_texture); //NOTE: must be same thread as SDL_Init() + render
        if (m_pixels) delete[] m_pixels;
        m_width = m_height = 0;
        m_pixels = 0;
#ifndef LAZY_TEXTURE
        if (sdl_texture) SDL_DestroyTexture(sdl_texture);
        sdl_texture = 0;
#endif //ndef LAZY_TEXTURE
        if (sdl_renderer) SDL_DestroyRenderer(sdl_renderer);
        if (sdl_window) SDL_DestroyWindow(sdl_window);
        sdl_renderer = 0;
        sdl_window = 0;
//debug("sql_quit");
        SDL_Quit();
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
};
#else
class DevWindow
{
public: //ctor/dtor
    template <typename ... ARGS> //accept all params
    DevWindow(ARGS&& ... args) { fatal("no SDL to emulate FB on XWindows"); }
    ~DevWindow() {}
    template <typename ... ARGS> //accept all params
    bool wait4sync(ARGS&& ... args) const { fatal("no sync without SDL on XWindows"); return false; }
    uint32_t* pxbuf() const { return 0; }
    size_t width() const { return 0; }
    size_t height() const { return 0; }
};
#endif //def HAS_SDL


//file wrapper:
//auto-closes file upon scope exit
#include <unistd.h> //close(), getpid(), usleep()
//#include <stdio.h> //open(), close()
#include <fcntl.h> //open(), O_RDONLY, O_RDWR
//#include <sys/stat.h> //open()?
//#include <sys/types.h> //open()?
#include <utility> //std::forward<>()
//#include <stdexcept> //std::runtime_error()
//#include <string.h> //strerror()
//#include <errno.h> //errno
int open(int fd = -1) { return fd; } //kludge: can't overload templated member function in AutoFile, so overload open() instead
class AutoFile
{
    int m_fd;
public: //ctor/dtor
//    AutoClose(const char* name): AutoClose(
//    AutoFile(int fbnum): AutoClose(fbname(fbnum), O_RDWR) {}
    template <typename ... ARGS>
    AutoFile(ARGS&& ... args): m_fd(::open(std::forward<ARGS>(args) ...)) {} //debug("autofile: fd %d", m_fd); }; //perfect fwd args to open()
//can't specialize member functions :(    template<int> AutoFile(int fd): m_fd(fd) {};
//    template<> AutoFile(): m_fd(-1) {}
    ~AutoFile()
    {
        if (isOpen() && ::close(m_fd) < 0) fatal("file close failed"); //std::runtime_error(strerror(errno));
        m_fd = -1;
    }
public: //operators
    operator int() const { return m_fd; }
public: //methods
    inline bool isOpen() const { return !(m_fd < 0); } //::isOpen(m_fd); }
};


//FB wrapper:
//auto-closes FB upon scope exit
//optional (default) mmap/munmap
//2 scenarios:
//- if XWindows is running, emulate FB using SDL window
//- if running in console, use FB/stdio
#include <fcntl.h> //O_RDWR
//#include <sys/stat.h> //open()?
//#include <sys/types.h> //open()?
//#include <utility> //std::forward<>()
#include <unistd.h> //close(), getpid(), usleep()
#include <sys/ioctl.h> //ioctl()
#include <sys/mman.h> //mmap(), munmap(), PROT_*, MAP_*
#include <linux/fb.h> //FBIO_*, struct fb_var_screeninfo, fb_fix_screeninfo
#include <ostream> //write()
template <typename DATA_T = uint32_t>
class AutoFB: public AutoFile
{
    using SUPER = AutoFile;
    DATA_T* m_pxbuf = (DATA_T*)MAP_FAILED;
    size_t m_stride32 = 0, m_height = 0;
    int m_fbnum;
    bool m_dirty = false;
    DevWindow* m_devwnd = 0;
//cursor control:
//turn cursor off when using framebuffer (interferes with pixels in that area)
//https://en.wikipedia.org/wiki/ANSI_escape_code#Escape_sequences
    static constexpr char* CURSOFF = "\x1B[?25l";
    static constexpr char* CURSON = "\x1B[?25h";
public: //types
    using data_t = DATA_T;
    struct timing_t
    {
        int xres, xtotal, yres, ytotal, pxclock; //main timing params
        bool for_timing, for_update; //want_mmap;
        timing_t(): timing_t(0, 0, 0, 0, 0, false, false) {}
        timing_t(int xr, int xt, int yr, int yt, int px, bool wt, bool mm): xres(xr), xtotal(xt), yres(yr), ytotal(yt), pxclock(px), for_timing(wt), for_update(mm) {};
    };
    static timing_t& NO_MMAP() { static timing_t m_timing; return m_timing; }
public: //ctor/dtor
//    template <typename ... ARGS>
//    AutoFB(ARGS&& ... args): SUPER(std::forward<ARGS>(args) ...), m_pxbuf(MAP_FAILED), m_stride32(0), m_height(0) //perfect fwd args to open()
    AutoFB(int fbnum): AutoFB(fbnum, NO_MMAP()) {}
    AutoFB(int fbnum, /*bool want_mmap = true,*/ const timing_t& gpuinfo): SUPER(fbname(fbnum), O_RDWR), m_fbnum(fbnum) //, m_pxbuf(MAP_FAILED), m_stride32(0), m_height(0)
    {
        const bool want_mmap = gpuinfo.for_update; //want_mmap; //(&gpuinfo != &NO_MMAP());
        const bool timovr = gpuinfo.xtotal && gpuinfo.yres; //broken-timovr = &gpuinfo != &(const timing_t&)NO_MMAP;
//debug("autoFB: fb# %d, mmap? %d, open? %d, ovr? %d: xtotal %d, yres %d", fbnum, want_mmap, isOpen(), timovr, gpuinfo.xtotal, gpuinfo.yres);
        if (!isOpen()) RETURN(want_mmap? fatal("open fb '%s' failed", fbname(fbnum)): 0);
        struct fb_fix_screeninfo scrf;
        if (/*!timovr &&*/ ::ioctl(*this, FBIOGET_FSCREENINFO, &scrf) < 0) fatal("get screen fixed info failed");
        if (timovr) //override timing with caller info
        {
            int xcmp = INTCMP(gpuinfo.xtotal, scrf.line_length / sizeof(DATA_T));
            int ycmp = INTCMP(gpuinfo.yres, scrf.smem_len / scrf.line_length);
            const char* cmpstr = "<=>";
            if (xcmp || ycmp) warn("FB# %d override: xtotal %'lu %c actual %'lu, yres %'lu %c actual %'lu", fbnum, gpuinfo.xtotal, cmpstr[xcmp + 1], scrf.line_length / sizeof(DATA_T), gpuinfo.yres, cmpstr[ycmp + 1], scrf.smem_len / scrf.line_length);
            if (isXWindows) scrf.line_length = gpuinfo.xtotal * sizeof(DATA_T); //NOTE: can't do this on real FB (rows would be misaligned in memory)
            if (isXWindows || (ycmp < 0)) scrf.smem_len = gpuinfo.yres * scrf.line_length; //can only shorten real FB
        }
        if (scrf.line_length % sizeof(DATA_T)) fatal("FB# %d row len %'d !multiple of px data type %d; row+gap addressing broken", fbnum, scrf.line_length, sizeof(DATA_T));
        m_stride32 = scrf.line_length / sizeof(DATA_T); //NOTE: might be larger than screen xres due to padding
//debug("rowlen %d", m_stride32);
        if (scrf.smem_len % scrf.line_length) warn("FB# %d memlen %'d !multiple of row len %'d", fbnum, scrf.smem_len, scrf.line_length);
        m_height = scrf.smem_len / scrf.line_length; //m_stride32;
//debug("height %d", m_height);
//        if (!want_mmap) return;
debug("using w %'d, h %'d, #px %'d, XWin? %d", m_stride32, m_height, m_stride32 * m_height, isXWindows);
        if (!gpuinfo.for_timing && !gpuinfo.for_update) return;
        if (isXWindows) RETURN(devwindow(gpuinfo));
        constexpr void* DONT_CARE = NULL; //CONSTDEF(DONT_CARE, NULL); //system chooses addr
//debug("addr %p, #px %'lu x len %'lu = size %'lu, prot 0x%x, flags 0x%x, fd %d, ofs 0", DONT_CARE, numpx(), sizeof(DATA_T), numpx() * sizeof(DATA_T), PROT_READ | PROT_WRITE, MAP_SHARED, (int)*this);
        m_pxbuf = (DATA_T*)::mmap(DONT_CARE, numpx() * sizeof(DATA_T), PROT_READ | PROT_WRITE, MAP_SHARED, (int)*this, 0 /*ofs*/); //shared with GPU
        if (m_pxbuf == (DATA_T*)MAP_FAILED) fatal("mmap fb failed"); //throw std::runtime_error(strerror(errno));
//        if (m_stride32 != scrv.xres) warn("raster stride32 %'lu != width %'d", m_stride32, scrv.xres);
//        if (new_height * new_stride32 * 4 != scrf.smem_len) debug(YELLOW_MSG "CAUTION: raster size %'lu != calc %'d", new_height * new_stride32 * 4, scrf.smem_len);
        ::write(*this, CURSOFF, strlen(CURSOFF));
    }
    ~AutoFB()
    {
        if (isXWindows) RETURN(devwindow());
        if (isOpen()) ::write(*this, CURSON, strlen(CURSON));
        if (m_pxbuf != (DATA_T*)MAP_FAILED && ::munmap(m_pxbuf, numpx() * sizeof(DATA_T)) < 0) fatal("munmap fb failed");
        m_pxbuf = (DATA_T*)MAP_FAILED;
    }
public: //methods
    static const char* fbname(int fbnum) { return strprintf("/dev/fb%d", fbnum); } //FB device name
    /*static*/ bool wait4sync(/*int fd,*/ timer_t<(int)1e6>::elapsed_t fallback_usec = 0)
    {
        m_dirty = false; //tell caller update was flushed
        if (isXWindows) return m_devwnd->wait4sync(); //NOTE: m_devwnd could be null
        bool retval = true;
        int arg = 0; //must be 0
        if (ioctl(*this, FBIO_WAITFORVSYNC, &arg) < 0)
        {
//TODO? adaptive vsync, OMAPFB_WAITFORVSYNC_FRAME
//    inline int getline()
//    {
//        int counter;
//        return (isOpen() && ioctl(m_fd, OMAPFB_GET_LINE_STATUS, &counter))? counter: -1;
//    }
//        static unsigned int arg = 0;
//        ioctl(fbdev, FBIO_WAITFORVSYNC, &arg);
//        if (!fallback_usec) fallback_usec = 10e3; //wait >= 1 msec so CPU doesn't get too busy
            if (!fallback_usec) fatal("wait4vsync failed (no fallback)");
            usleep(fallback_usec); //kludge: try to maintain timing
            retval = false;
        }
//wrong        m_dirty = false; //benign (caller must write to FB shm); here just = status that caller can check
        return retval;
    }
public: //helpers
    class PxRow
    {
    public: //operators
        inline DATA_T& operator[](size_t inx) const
        {
            return ((DATA_T*)this)[inx];
        }
    };
public: //operators
//    operator DATA_T*() const { return m_pxbuf; }
    inline const PxRow& operator[](size_t inx) const
    {
        return *(const PxRow*)&m_pxbuf[inx * m_stride32]; //kludge: cast a memberless row proxy on top of px buf at requested row address
    }
public: //properties
    inline bool dirty() const { return m_dirty; }
    /*inline*/ void dirty(bool newval)
    {
        m_dirty = newval;
        if (isXWindows) return m_devwnd->dirty(newval); //NOTE: m_devwnd could be null
    }
//    DATA_T* pixels() const { return m_pxbuf; }
    inline int fbnum() const { return m_fbnum; }
    inline size_t numpx() const { return m_stride32 * m_height; }
    inline size_t width() const { return m_stride32; }
    inline size_t height() const { return m_height; }
private: //emulate FB with SDL in XWindows: can't get XWindows FB driver to work :(
    void devwindow(const timing_t& gpuinfo)
    {
        if (m_devwnd) return; //already open
        m_devwnd = new DevWindow(gpuinfo.xres, gpuinfo.xtotal, gpuinfo.yres, gpuinfo.ytotal, gpuinfo.pxclock, gpuinfo.for_update);
        m_pxbuf = m_devwnd->pxbuf();
        m_stride32 = m_devwnd->width();
        m_height = m_devwnd->height();
    }
    void devwindow()
    {
        if (m_devwnd) delete m_devwnd;
        m_devwnd = 0;
        m_pxbuf = 0;
    }
};


#if 0
//wrapper for 2D addressing:
//NOTE: doesn't use array of arrays but looks like it
//parent manages all memory
//2D singleton: data is in parent
//instances are created in-place (overlaid onto target memory); requires instances to be 0 size
//static data is used to avoid instance data (more efficient memory usage for large arrays); a tag parameter is used to allow multiple instances of static data
#include <stdexcept> //std::runtime_error(), std::out_of_range()
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
    inline ary& operator+(size_t ofs) /*const*/ { return this[ofs]; }
    inline size_t operator-(const ary& that) const { return (this - &that) / CHILD_T::m_len; }
//    inline CHILD_T* operator&() { return 
private: //helpers
    inline size_t max_inx() const { return (m_limit && child_size())? (m_limit - (DATA_T*)this) / child_size(): 0; } //allow indexing beyond this row as long as memory is there
    const CHILD_T& oob(size_t inx) const //generate out of bounds error
    {
        fatal_type(std::out_of_range, "%s index %'lu out of range 0..%'lu", item_type, inx, max_inx()); //m_len);
        return *NULL_OF(CHILD_T); //NULL;
    }
};
#endif //0


#if 0
//shared memory object base class:
class shmobj
{
    using self_t = shmobj;
public: //static helpers
//place all instances at pre-determined location:
    static void* operator new(size_t size, self_t* addr = 0) //, int shmkey = 0, SrcLine srcline = 0)
    {
//        if (size != sizeof(self_t)) fatal("bad shmdata alloc size: %'u, expected %'u", size, sizeof(self_t)); //"wrong alloc size"); //no run-time str :(
        static self_t* newptr = 0;
        self_t* oldptr = newptr; newptr = addr; //update for next time
        debug("shmobj::new: size %'u, set new ptr @%p, ret ptr @%p", size, addr, oldptr);
        return oldptr;
    }
    static void operator delete(void* ptr)
    {
        debug("shmobj::delete: ptr @%p", ptr);
    }
};
//semantics: becomes ptr to
template <typename DATA_T>
class shmptr
{
    DATA_T* m_ptr = new DATA_T();
//    DATA_T m_real;
public:
    using type = DATA_T;
    shmptr() {}
    shmptr(const DATA_T& other) { *m_ptr = other; } //: m_real(other) {}
//    operator DATA_T&() { return m_real; }
//    DATA_T& operator=(const DATA_T& other) { m_real = other; return *this; }
//    int& y = m_real.y;
    DATA_T& operator*() { return *m_ptr; } //&m_real; }
//    inline DATA_T& ref() /*const*/ { return *m_ptr; } //m_real; }
    DATA_T* operator->() { return m_ptr; }
//    DATA_T& operator=(const DATA_T& other) { *m_ptr = other; return *this; }
//class shmproxy2: public DATA_T
//    operator DATA_T&() { return *m_ptr; }
};
#endif //0


#if 0 //another try at shmwrapper
//#include <atomic>
#include <sys/ipc.h> //IPC_*
#include <sys/shm.h> //shmget(), shmat(), shmctl(), shmdt()
template <typename WRAP_T, uint32_t SHMKEY>
#include <stdexcept> //std::runtime_error(), std::out_of_range()
class shmwrap
{
//    using self_t = shmwrap;
    class wrapped_flag_t: public WRAP_T
    {
    public:
        template <typename ... ARGS>
        wrapped_flag_t(ARGS&& ... args): WRAP_T(std::forward<ARGS>(args) ...) {} //perfect fwd to real ctor
        ~wrapped_flag_t() {}
        /*std::atomic<int>*/ int m_shminit = 0; //flag telling whether ctor/dtor needs to be called; put at end so member addr won't be affected
    };
    wrapped_flag_t* m_ptr = 0;
public: //ctor/dtor
    using wrapped_t = WRAP_T;
    template <typename ... ARGS>
    shmwrap(ARGS&& ... args): m_ptr(shmalloc(sizeof(wrapped_flag_t))) //first get memory, then init if needed
    {
//        debug(PINK_MSG "shmwrap: ptr %p, size %'lu, #att %d, init %d", m_ptr, sizeof(wrapped_t), numatt(), m_ptr->m_shminit);
        if (numatt() > 1) //check if *m_ptr was initialized; CAUTION: can't use data members
            if (m_ptr->m_shminit++) return; //only call ctor 1x; count #callers
//NOTE: ctor will overwrite m_shminit++, but ctor will set correct value anyway
//        new /*(m_ptr)*/ DELEGATED_T(std::forward<ARGS>(args) ...); //perfect fwd; don't need placement "new" (custom "new" already handles it)
//        m_ptr->/*DELEGATED_T*/YALP(std::forward<ARGS>(args) ...); //perfect fwd; explicitly call ctor to init
        new (m_ptr) wrapped_t(std::forward<ARGS>(args) ...); //perfect fwd; explicitly call ctor to init
    }
    ~shmwrap()
    {
//debug(PINK_MSG "dealloc %d bytes? %d", sizeof(CLS_T), !!m_ptr); }
//        if (m_ptr) delete m_ptr;
//        if (m_ptr && (m_ptr->numatt() < 2)) delete m_ptr; //destroy only if no other proc/thread attached
//        debug(PINK_MSG "~shmwrap: ptr %p, #att %d, shm was init? %d", m_ptr, numatt(), m_ptr? m_ptr->m_shminit: -1);
        if (!m_ptr) return;
        if (!--m_ptr->m_shminit) m_ptr->~wrapped_t(); //explicit dtor
        shmfree(m_ptr); //dettach (dealloc) only; other procs still using shm
        m_ptr = 0;
    }
public: //operators
    WRAP_T* operator->() { return m_ptr; }
    inline const WRAP_T& operator[](size_t inx) const { return m_ptr[inx]; }
    inline WRAP_T& operator[](size_t inx) { return const_cast<WRAP_T&>(std::as_const(*this).operator[](inx));  } //non-const variant (DRY)
    inline WRAP_T* operator+(size_t ofs) /*const*/ { return m_ptr + ofs; } //&m_ptr[ofs]; }
    inline size_t operator-(const WRAP_T* that) const { return m_ptr - that; }
private: //static helpers
//place all instances at same shm address:
//    static void* operator new(size_t size, void* callerptr = 0) //...) //, int shmkey = 0, SrcLine srcline = 0)
    using shmid_ds_t = struct shmid_ds; //decltype() doesn't like "struct" :(
    static wrapped_flag_t* shmalloc(size_t size)
    {
        static wrapped_flag_t* ptr = 0;
        if (size != sizeof(wrapped_flag_t)) fatal_type(std::out_of_range, "bad shmdata alloc size: %'u, expected %'u, sizeof wrapped_t %'lu", size, sizeof(wrapped_flag_t), sizeof(WRAP_T)); //don't allow derived classes; only inh final class (to avoid mixed memory sizes)
//        if (ptr != callerptr) fatal("shm new(%'lu): already have a shmdata instance: @%p, caller's @%p", size, ptr, callerptr); //only allow attach 1x per process; NOTE: first alloc calls here 2x (alloc + placement new)
        if (ptr) { debug(PINK_MSG "reuse prev shmdata @%p", ptr); return ptr; } //fatal("already have a shmdata instance");
        int shmid = ::shmget(SHMKEY, size /*+ sizeof(shmid)*/, 0666 | IPC_CREAT); //| IPC_EXCL: 0)); // | SHM_NORESERVE); //NOTE: clears to 0 upon creation
//        DEBUG_MSG(CYAN_MSG << "ShmSeg: cre shmget key " << FMT("0x%lx") << key << ", size " << size << " => " << FMT("id 0x%lx") << shmid << ENDCOLOR);
        if (shmid == -1) shmid = ::shmget(SHMKEY, 1, 0666 | IPC_CREAT); //retry with smalled size
        if (shmid == -1) fatal("can't find shm key 0x%x", SHMKEY); //failed to create or attach
        shmid_ds_t shminfo;
        if (::shmctl(shmid, IPC_STAT, &shminfo) == -1) fatal("can't get shm status");
        if (shminfo.shm_segsz < size) fatal_type(std::out_of_range, "shm size %'lu too small (need at least %'lu); ipcrm and retry", shminfo.shm_segsz, size);
        if (shminfo.shm_segsz > size) warn("shm size %'lu larger than expected (%'lu)", shminfo.shm_segsz, size);
        constexpr void* DONT_CARE = NULL; //CONSTDEF(DONT_CARE, NULL); //system chooses addr
        static constexpr int flags = 0; //read/write access
        /*shmdata_t* */ ptr = (wrapped_flag_t*)::shmat(shmid, DONT_CARE, flags);
        debug(PINK_MSG "shm::new: key 0x%x, size %'u vs sizeof %'u, shm id 0x%lx, ptr @%p, #att %d -> %d", SHMKEY, size, sizeof(wrapped_flag_t), shmid, ptr, shminfo.shm_nattch, numatt(shmid));
        if (ptr == (wrapped_flag_t*)-1) fatal("can't attach shm key 0x%x, id %d", SHMKEY, shmid);
//        *ptr++ = shmid; //need id to get #nattach later
//        if (!svnatt) ptr->fbnum = -1; //FB device !chosen yet
        return ptr;
    }
    static void shmfree(wrapped_flag_t* ptr)
    {
  //      int shmid = *(int*)--ptr;
        int shmid = ::shmget(SHMKEY, 1, 0666); //use minimum size in case it changed
        if (shmid == -1) fatal("can't find shm");
        auto svnatt = numatt(shmid); //need to get shm info before dettach?
        if (::shmctl(shmid, IPC_RMID, NULL /*ignored*/)) fatal("can't delete shm"); //won't be deleted until last process dettaches
        if (::shmdt(ptr) == /*(decltype(::shmdt()))*/-1) fatal("can't dettach shm");
//        ptr = 0; //can't use m_shmptr after this point
        debug(PINK_MSG "shm::delete: id %d, ptr @%p, #att %d", shmid, ptr, svnatt);
    }
//helpers:
    static /*nattch_t*/ decltype(shmid_ds_t::shm_nattch) numatt(int shmid)
    {
        shmid_ds_t shminfo;
        if (::shmctl(shmid, IPC_STAT, &shminfo) == /*(decltype(::shmctl()))*/-1) fatal("can't get shm status"); //throw std::runtime_error(strerror(errno));
        return shminfo.shm_nattch;
    }
public:
//can be static, but non-static allows caller to use like other member functions:
    static decltype(shmid_ds_t::shm_nattch) numatt()
    {
        int shmid = ::shmget(SHMKEY, 1, 0666); //use minimum size in case it changed
        if (shmid == -1) fatal("can't find shm");
        return numatt(shmid);
    }
};
#endif


#if 0 //NO- no longer needed; use evt emitter instead
//shm mutex:
//based on https://stackoverflow.com/questions/13161153/c11-interprocess-atomics-and-mutexes
//https://www.gonwan.com/2014/04/10/sharing-mutex-and-condition-variable-between-processes/
#include <pthread.h> //pthread_mutex*()
//#include <atomic>
class ShmMutex //: public pthread_mutex_t
{
//private:
//    void* _handle;
    pthread_mutex_t m_mutex;
//NOTE: if parent places object in shm, *this will be the mutex ptr
//    std::atomic<bool> m_init; //shm will be 0 first time
    bool m_init; //= 0;
    int m_flag;
public: //ctor/dtor
    ShmMutex() //void* shmMemMutex, bool recursive = false, )
    {
debug(PINK_MSG "need init shm mutex@ %p? %d, flag %d", this, !m_init, m_flag);
//        if (m_init) return;
        const bool recursive = false;
//        _handle = shmMemMutex;
        for (;;) //dummy loop for flow control
        {
            pthread_mutexattr_t mattr;
            if (::pthread_mutexattr_init(&mattr)) break;
            if (::pthread_mutexattr_setpshared(&mattr, PTHREAD_PROCESS_SHARED)) break;
            if (::pthread_mutexattr_settype(&mattr, recursive? PTHREAD_MUTEX_RECURSIVE_NP: PTHREAD_MUTEX_FAST_NP)) break;
            if (::pthread_mutex_init(&m_mutex, &mattr)) break;
            ::pthread_mutexattr_destroy(&mattr);
            m_flag = 12345;
            m_init = true;
            return; //success
        }
//        ::free(_handle);
        /*throw ThreadException*/fatal("Unable to init shm mutex");
    }
    /*virtual*/ ~ShmMutex()
    {
if (m_init) debug(PINK_MSG "destroy shm mutex, locked? %d", islocked());
        if (islocked()) munlock(); //must be unlocked < destroy
        /*if (m_init)*/ ::pthread_mutex_destroy(&m_mutex); //(pthread_mutex_t*)this);
        m_flag = 0;
        m_init = false;
    }
//    operator pthread_mutex_t*() { return (pthread_mutex_t*)this; }
    operator pthread_mutex_t*() { return &m_mutex; }
public: //methods
    void mlock()
    {
        if (!::pthread_mutex_lock(&m_mutex)) return;
        /*throw ThreadException*/fatal("Unable to lock shm mutex");
    }
    void munlock()
    {
        if (!::pthread_mutex_unlock(&m_mutex)) return;
        /*throw ThreadException*/fatal("Unable to unlock shm mutex");
    }
    inline bool islocked() { return !tryLock(false); }
    bool tryLock(bool keep_locked = true)
    {
        int tryResult = ::pthread_mutex_trylock(&m_mutex); //(pthread_mutex_t*)this);
        if (!tryResult) { if (!keep_locked) munlock(); return true; } //success
        if (tryResult == EBUSY) return false;
        /*throw ThreadException*/fatal("Unable to lock smh mutex");
    }
public: //helper class
    class lock
    {
        ShmMutex& m_mutex;
    public:
        lock(ShmMutex& mutex): m_mutex(mutex)
        {
#if 0 //debug
            if (m_mutex.tryLock()) return;
            debug("mutex busy; block on mutex@ %p", this);
#endif
            m_mutex.mlock();
        }
        ~lock() { m_mutex.munlock(); }
//        operator ShmMutex&() { return m_mutex; }
        ShmMutex& get_mtx() { return m_mutex; }
    };
    using read_lock = lock;
    using write_lock = lock;
    using PROVIDER_LOCKTYPE = typename ShmMutex::write_lock; //std::lock_guard<decltype(m_mtx)>;
    using CONSUMER_LOCKTYPE = typename ShmMutex::read_lock; //std::unique_lock<decltype(m_mtx)>; //not: class 
};


//shm cond var:
//https://www.gonwan.com/2014/04/10/sharing-mutex-and-condition-variable-between-processes/
#include <pthread.h> //pthread_cond*()
//#include <atomic>
class ShmCondVar //: public pthread_cond_t
{
//private:
//    void* _handle;
    pthread_cond_t m_condvar;
//NOTE: if parent places object in shm, *this will be the cond var ptr
//    std::atomic<bool> m_init; //shm will be 0 first time
    bool m_init;
    int m_flag;
public: //ctor/dtor
    ShmCondVar()
    {
debug(PINK_MSG "need init shm cond var@ %p? %d, flag %d", this, !m_init, m_flag);
//        if (m_init) return;
        for (;;) //dummy loop for flow control
        {
            pthread_condattr_t cattr;
            if (::pthread_condattr_init(&cattr)) break;
            if (::pthread_condattr_setpshared(&cattr, PTHREAD_PROCESS_SHARED)) break;
//        ::pthread_mutexattr_settype(&attr, recursive ? PTHREAD_MUTEX_RECURSIVE_NP : PTHREAD_MUTEX_FAST_NP);
            if (::pthread_cond_init(&m_condvar, &cattr)) break;
            ::pthread_condattr_destroy(&cattr);
            m_flag = 54321;
            m_init = true;
            return; //success
        }
//        ::free(_handle);
        /*throw ThreadException*/fatal("Unable to init shm cond var");
    }
    /*virtual*/ ~ShmCondVar()
    {
//        ::pthread_mutex_destroy((pthread_mutex_t*)_handle);
debug(PINK_MSG "destroy shm cond var? %d", m_init);
        notify_all(); //can't have any blocked threads
        /*if (m_init)*/ ::pthread_cond_destroy(&m_condvar); //(pthread_cond_t*)this);
        m_flag = 0;
        m_init = false;
    }
//    operator pthread_cond_t*() { return this; }
public: //methods
    void notify_one()
    {
        if (!::pthread_cond_signal(&m_condvar)) return;
        /*throw ThreadException*/fatal("Unable to signal shm cond var");
    }
    void notify_all()
    {
        if (!::pthread_cond_broadcast(&m_condvar)) return;
        /*throw ThreadException*/fatal("Unable to signal shm cond var");
    }
    void wait(ShmMutex::lock& mutex_lock)
    {
        if (!::pthread_cond_wait(&m_condvar, mutex_lock.get_mtx())) return; //(pthread_mutex_t*)&mutex_lock.get_mtx())) return;
        /*throw ThreadException*/fatal("Unable to wait for cond var");
    }
};
#elif 0
#include <mutex>
//#define ShmMutex  std::mutex
class ShmMutex: public std::mutex
{
public:
    using read_lock = std::unique_lock<std::mutex>;
    using write_lock = std::lock_guard<std::mutex>;
};
#include <condition_variable>
#define ShmCondVar  std::condition_variable
//    static inline std::mutex& mtx() { static std::mutex mtx = 0; return mtx; } //avoid mutex locks except when waiting; //PTHREAD_MUTEX_INITIALIZER?
#endif


//read file:
//suitable for small files only (sync)
#include <stdio.h> //FILE, fopen(), fseek(), ftell(), fread(), fclose()
//#include <stdlib.h>
#include <string> //std::string
std::string readfile(const char* filepath)
{
    std::string result;
    FILE* f = fopen(filepath, "r"); if (!f) fatal("can't open file");
    if (fseek(f, 0, SEEK_END)) fatal("can't seek eof");
    long fsize = ftell(f); if (fsize < 0) fatal("can't get file len");
    result.reserve(fsize);
    if (fseek(f, 0, SEEK_SET)) fatal("can't seek start");
    long rdlen = fread(&result[0], 1, fsize, f); if (rdlen != fsize) fatal("read error");
    if (fclose(f)) fatal("can't close file");
//    char buffer[250];
//    while (fgets(buffer, sizeof(buffer), pipe.get()) != nullptr) result += buffer;
    std::string& result_esc = str_replace(result.c_str(), "\n", CYAN_MSG "\\n" ENDCOLOR_NOLINE); //esc special chars in debug output
debug("read file '%s' output %'lu:'%s'", filepath, result.length(), result_esc.c_str());
    return result;
}


//execute a shell command:
//results returned to caller as string (with newlines)
//from https://stackoverflow.com/questions/478898/how-do-i-execute-a-command-and-get-the-output-of-the-command-within-c-using-po
//#include <cstdio>
//#include <iostream>
#include <stdio.h> //FILE, fgets(), popen(), pclose()
#include <unistd.h> //pipe()
#include <memory> //std::unique_ptr<>
//#include <stdexcept>
#include <string> //std::string
//#include <array>
std::string shell(const char* cmd)
{
//    std::array<char, 128> buffer;
    std::string result;
//debug("run shell command '%s' ...", cmd);
    std::unique_ptr<FILE, decltype(&pclose)> pipe(popen(cmd, "r"), pclose);
    if (!pipe) fatal("can't create pipe"); //throw std::runtime_error("popen() failed!");
    char buffer[250];
    while (fgets(buffer, sizeof(buffer), pipe.get()) != nullptr) result += buffer;
    std::string& result_esc = str_replace(result.c_str(), "\n", CYAN_MSG "\\n" ENDCOLOR_NOLINE); //esc special chars in debug output
//debug("shell '%s' output %'lu:'%s'", cmd, result.length(), result_esc.c_str());
    return result;
}


#elif _HOIST == HOIST_UTILS
 #undef _HOIST
#define _HOIST  HOIST_OTHER
#include __FILE__  //error here requires CD into folder or add "-I." to compile
///////////////////////////////////////////////////////////////////////////////
////
/// lower level defs + helpers (will be hoisted above high level helpers + defs)
//

//make a unique name for this line/macro:
//also puts a little debug info (location) into the name
#define THISLINE(name)  CONCAT(name, __LINE__)


//#elements in an array:
//array elements can be *any* type
#define SIZEOF(thing)  (sizeof(thing) / sizeof((thing)[0]))
#define u32len(bytelen)  ((bytelen) / sizeof(uint32_t))
#define u8len(u32len)  ((u32len) * sizeof(uint32_t))


//int compare:
//ret -1 for <, 0 for =, +1 for >
#define INTCMP(lhs, rhs)  (((lhs) > (rhs)) - ((lhs) < (rhs)))


//divide up:
//https://stackoverflow.com/questions/2745074/fast-ceiling-of-an-integer-division-in-c-c
//#define divup(num, den)  (((num) + (den) - 1) / (den))
#define divup(num, den)  ((num) / (den) + ((num) % (den) != 0))

//rounded divide:
#define rdiv(num, den)  (((num) + (den) / 2) / (den))
//make value a multiple of another:
//#define multiple(num, den)  ((num) - (num) % (den))

//left/right shift:
#define shiftlr(val, pos)  (((pos) < 0)? ((val) << -(pos)): ((val) >> (pos)))

#define bytes2bits(n)  ((n) * 8)

//get msb of value:
#define msb(u32)  ((u32) & ~((u32) >> 1))

//bit value:
#define BIT(n)  (1 << (n))



//flip a value:
//#include <vector> //kludge: macro name conflict; create other def first so macro here can override it
//#define flip(val, max)  ((max) - (val) - 1)


//min/max:
//use these when std::min/max are too strict with types:
#define MIN(...)  UPTO_4ARGS(__VA_ARGS__, MIN_4ARGS, MIN_3ARGS, MIN_2ARGS, missing_arg) (__VA_ARGS__)
#define MIN_2ARGS(lhs, rhs)  (((lhs) < (rhs))? (lhs): (rhs))
#define MIN_3ARGS(lhs, mhs, rhs)  MIN_2ARGS(lhs, MIN_2ARGS(mhs, rhs))
#define MIN_4ARGS(llhs, rlhs, lrhs, rrhs)  MIN_2ARGS(MIN_2ARGS(llhs, rlhs), MIN_2ARGS(lrhs, rrhs))

#define MAX(...)  UPTO_4ARGS(__VA_ARGS__, MAX_4ARGS, MAX_3ARGS, MAX_2ARGS, missing_arg) (__VA_ARGS__)
#define MAX_2ARGS(lhs, rhs)  (((lhs) > (rhs))? (lhs): (rhs))
#define MAX_3ARGS(lhs, mhs, rhs)  MAX_2ARGS(lhs, MAX_2ARGS(mhs, rhs))
#define MAX_4ARGS(llhs, rlhs, lrhs, rrhs)  MAX_2ARGS(MAX_2ARGS(llhs, rlhs), MAX_2ARGS(lrhs, rrhs))


//end of string buf:
//CAUTION: points past last char
//#ifndef strend
//#define strend(buf)  ((buf) + sizeof(buf))
//#endif


//convert to string + force inner macro expansion:
//#ifndef TOSTR
// #define TOSTR(str)  CONCAT(#str)
 #define TOSTR(str)  TOSTR_NESTED(str)
 #define TOSTR_NESTED(str)  #str //kludge: need nested level to force expansion
//#endif


//use in place of "this" when no instance needed
//use for decltype, which does not execute but needs an instance for context
#ifndef NULL_OF
 #define NULL_OF(cls)  ((cls*)0)
#endif


//dummy keywords:
//should use "static" or "void" but compiler doesn't like it
//compiler doesn't like (void)expr either
#define STATIC  //static
#define VOID  //void

//kludge: compiler doesn't like "return (void)expr" so fake it
#define RETURN(...) { __VA_ARGS__; return; }


//define a const symbol:
//doesn't use any run-time storage space
#ifndef CONSTDEF
 #define CONSTDEF(...)  UPTO_4ARGS(__VA_ARGS__, CONSTDEF_4ARGS, CONSTDEF_3ARGS, CONSTDEF_2ARGS, missing_arg) (__VA_ARGS__)
 #define CONSTDEF_2ARGS(item, value)  enum { item = value }
 #define CONSTDEF_3ARGS(name, item, value)  \
 struct name { enum { item = value }; }
//kludge: split name into 2 args to allow it to contain ","
 #define CONSTDEF_4ARGS(name1, name2, item, value)  \
 struct name1, name2 { enum { item = value }; }
#endif


//token pasting:
#ifndef CONCAT
 #define CONCAT(...)  UPTO_4ARGS(__VA_ARGS__, CONCAT_4ARGS, CONCAT_3ARGS, CONCAT_2ARGS, CONCAT_1ARG) (__VA_ARGS__)
 #define CONCAT_1ARG(val)  val
 #define CONCAT_2ARGS(val1, val2)  val1 ## val2
 #define CONCAT_3ARGS(val1, val2, val3)  val1 ## val2 ## val3
 #define CONCAT_4ARGS(val1, val2, val3, val4)  val1 ## val2 ## val3 ## val4
#endif


//clamp byte (or other val):
//limit to range 0..0xFF
//#define clamp(...)  UPTO_3ARGS(__VA_ARGS__, clamp_3ARGS, clamp_2ARGS, clamp_1ARG) (__VA_ARGS__)
//#define clamp_1ARG(val)  clamp_2ARGS(val, 0xFF) //((val) & 0xFF)
//#define clamp_2ARGS(val, shift)  clamp_3ARGS(val, shift, 0xFF)
//#define clamp_2ARGS(val, limit)  MIN(limit, MAX(0, val)) //clamp_3ARGS(val, limit, 0)
//#define clamp_3ARGS(val, limit, shift_bits)  MIN(limit, MAX(0, shiftlr(val, shift_bits)))

//mask/wrap byte:
#define cbyte(...)  UPTO_3ARGS(__VA_ARGS__, cbyte_3ARGS, cbyte_2ARGS, cbyte_1ARG) (__VA_ARGS__)
#define cbyte_1ARG(val)  ((val) & 0xFF)
#define cbyte_2ARGS(val, shift)  cbyte_3ARGS(val, shift, 0xFF)
#define cbyte_3ARGS(val, shift, mask)  (shiftlr(val, shift) & (mask))


//poly fill:
#include <type_traits> //std::remove_cv_t<>, std::remove_reference_t<>
template< class T >
struct remove_cvref { typedef std::remove_cv_t<std::remove_reference_t<T>> type; };


//get type of a class in-place:
//from https://stackoverflow.com/questions/33230665/c-are-there-ways-to-get-current-class-type-with-invariant-syntax
//!worky :(
//#define GET_SELF  \
//static auto helper() -> std::remove_reference<decltype(*this)>::type;  \
//typedef decltype(helper()) self
//static auto get_self() { return this; }  \
//typedef decltype(get_self()) self_t
//using self_t = typename decltype(get_self())
//using self_t = typename decltype(helper())


CONSTDEF(CACHELEN, 64); // /*static constexpr size_t*/ enum { CACHELEN = 64 }; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both


#include <clocale> //setlocale()
const char* THISLINE(dummy) = setlocale(LC_ALL, ""); //enable %'d commas in printf


//turn null ptr into empty/default str:
inline const char* ifnull(const char* str, const char* null = 0)
{
    return (str && str[0])? str: (null && null[0])? null: "";
}


//remove prefix from a string:
#include <string.h>
//#include <stdio.h> //printf()
/*inline*/ const char* strafter(const char* str, /*const char* */ char substr, bool want_last = true)
{
//printf("str after '%s' 0x%x\n", ifnull(str, "(none)"), substr);
    for (;;)
    {
        const char* bp = (str && substr)? strchr(str, substr): 0; //strstr(str, substr): 0;
        if (!bp) return ifnull(str, "(no file)");
        if (!want_last) return bp;
        str = bp + 1;
    }
}


//sprintf convenience wrapper:
#include <stdio.h> //printf(), snprintf(), vsnprintf(), sscanf()
#include <atomic>  //std::atomic<>, std::atomic_wait(), std::atomic_notify_all()
#include <utility> //std::forward<>()
//#define strprintf(buf, ...)  (snprintf(buf, sizeof(buf), __VA_ARGS__), buf)
template <typename ... ARGS>
const char* strprintf(ARGS&& ... args)
{
    static std::atomic<int> ff;
    static char buf[2][999]; //CAUTION: must be static to return outside current function
    char* bufp = buf[ff++ % SIZEOF(buf)]; //allow nested messages
    int len = snprintf(bufp, sizeof(buf[0]), std::forward<ARGS>(args) ...); //perfect fwd args to sprintf()
    CONSTDEF(RESV_LEN, 15);
    if (len >= sizeof(buf[0])) snprintf(bufp + sizeof(buf[0]) - RESV_LEN, RESV_LEN, " (+%'d) ...", len - sizeof(buf[0]) - RESV_LEN); //show truncation indicator + amount trimmed
    return bufp;
}


//str replace:
//caller can call retval.c_str() to get const char* result
#include <string> //std::string
#include <string.h> //strlen()
std::string& str_replace(const char* str, const char* from, const char* to = 0)
{
    static std::string result; //static return from function avoids copy ctor in caller
    result = ifnull(str); //str? str: "";
    if (!from) return result;
    size_t fromlen = strlen(from);
    for (;;)
    {
        std::size_t found = result.find(from);
        if (found == std::string::npos) return result;
        result.replace(found, fromlen, ifnull(to));
    }
}   
inline std::string& str_replace(const std::string& str, const std::string& from, const std::string& to) { return str_replace(str.c_str(), from.c_str(), to.c_str()); }
//inline std::string& str_replace(const std::string& str, const std::string& from) { return str_replace(str.c_str(), from.c_str()); }
inline std::string& str_replace(const std::string& str, const char* from, const char* to = 0) { return str_replace(str.c_str(), from, to); }
//inline std::string& str_replace(const std::string& str, const char* from) { return str_replace(str.c_str(), from); }


//check for file existence:
#include <sys/stat.h> //struct stat
inline bool fexists(const char* path)
{
    struct stat info;
    return !stat(path, &info); //file exists
}


//clear array:
template<typename DATA_T>
void memset(DATA_T* ary, DATA_T val, size_t len)
{
    while (len-- > 0) *ary++ = val;
}


//ANSI color codes:
//makes console output easier to read
//https://en.wikipedia.org/wiki/ANSI_escape_code
//TODO? use user literals instead: https://en.cppreference.com/w/cpp/language/user_literal
//constexpr const char* operator"" RED(const char* str) { return k * 1000UL; }
#define ANSI_COLOR(code)  "\x1b[" code "m"
//#define ANSI_COLOR(code)  std::ostringstream("\x1b[" code "m")
//use bright variants (more readable):
#define RED_MSG  ANSI_COLOR("1;31") //too dark: "0;31"
#define GREEN_MSG  ANSI_COLOR("1;32")
#define YELLOW_MSG  ANSI_COLOR("1;33")
#define BLUE_MSG  ANSI_COLOR("1;34")
#define MAGENTA_MSG  ANSI_COLOR("1;35")
#define PINK_MSG  MAGENTA_MSG //easier to spell :P
#define CYAN_MSG  ANSI_COLOR("1;36")
#define GRAY_MSG  ANSI_COLOR("0;37") //use dim; bright is too close to white
#define ENDCOLOR_NOLINE  ANSI_COLOR("0")
#define ENDCOLOR_NEWLINE  ENDCOLOR_NOLINE "\n"
//#define ENDCOLOR_ATLINE  SRCLINE ENDCOLOR_NEWLINE
//#define ENDCOLOR_ATLINE_INFO  SRCLINE "%s" ENDCOLOR_NEWLINE //with run-time info
#define TODO(msg)  YELLOW_MSG [TODO] msg ENDCOLOR_NOLINE


//misc message functions:
#include <stdio.h> //FILE*, printf(), fprintf()
//#include <cstdio> //printf()
#include <stdexcept> //std::runtime_error(), std::out_of_range()
#include <string.h> //strerror()
#include <errno.h> //errno
//static thread_local int prevout = 0; //1; //true; //start with newline first time
#define SRCLINE  "@" __FILE__ ":" TOSTR(__LINE__)
#define SRCLINEF  strafter(SRCLINE, '/') //"/")
#define RTI_FMT  " T+%'4.3f $%d @%s" //f#%d
#define rti()  (double)epoch.elapsed() / (int)1e3, thrinx(), SRCLINEF //fileno(debout),
//#pragma message(YELLOW_MSG "add mutex to prevent msg interleave?")
//NOTE: first arg must be lit str below (printf-style fmt)
//#define warn(...)  (log(YELLOW_MSG __VA_ARGS__), 0)
#define warn(...)  debug(YELLOW_MSG "WARNING: " __VA_ARGS__)
#define error(...)  debug(PINK_MSG "ERROR: " __VA_ARGS__)
//#define fatal()  throw std::runtime_error(std::string(strerror(errno)))
#define fatal(...)  fatal_type(std::runtime_error, __VA_ARGS__)
#define fatal_type(exctype, ...)  fatal_info(exctype, RED_MSG "FATAL: " __VA_ARGS__, strerror(errno), rti())
#define fatal_info(exctype, fmt, ...)  throw *(new exctype(strprintf(fmt "; last error: %s" RTI_FMT ENDCOLOR_NOLINE, __VA_ARGS__)))
#define debug_dedup(limit, ...)  ((line_elapsed(__LINE__) < (limit))? 0: debug(__VA_ARGS__))
#define debug(...)  debug_maybe(true, BLUE_MSG __VA_ARGS__, rti()) //NOTE: adds run-time info *and* ensures >= 2 args before splitting off first arg
FILE* debout = stdout;
#define debug_noinfo(...)  debug_maybe(false, BLUE_MSG __VA_ARGS__, "") //ensures >= 2 args before splitting off
//handle prevout within thrinx(): #define debug_maybe(want_info, fmt, ...)  prevout = fprintf(debout, want_info? "\n" fmt RTI_FMT ENDCOLOR_NEWLINE + (prevout > 0): "\n" fmt "%s" ENDCOLOR_NEWLINE + (prevout > 0), __VA_ARGS__)
#define debug_maybe(want_info, fmt, ...)  fprintf(debout, want_info? fmt RTI_FMT ENDCOLOR_NEWLINE: fmt "%s" ENDCOLOR_NEWLINE, __VA_ARGS__)
#pragma message(TODO(lock around fprintf?))
//TODO: fix color spread, threading, allow turn on/off
//#define debug_1ARG(msg)  prevout = printf("\n" BLUE_MSG "%s" msg ENDCOLOR_ATLINE_INFO + (prevout > 0), DebugScope::top(": "), rti())
//#define debug_MORE_ARGS(msg, ...)  prevout = printf("\n" BLUE_MSG "%s" msg ENDCOLOR_ATLINE_INFO + (prevout > 0), DebugScope::top(": "), __VA_ARGS__, rti())
//#define rti()  strprintf("$%d T+%4.3f", thrinx(), (double)elapsed<(int)1e3>() / (int)1e3) //(now_msec() - started) / (int)1e3)
//const char* rti()
//{
//    static char buf[100];
//    snprintf(buf, sizeof(buf), " $%d T+%4.3f", thrinx(), (now_msec() - started) / (int)1e3);
//    return buf;
//}


//convert time struct to msec/usec:
//uint32_t usec wraps @~1.2 hr, not good enough for a 5 hr show schedule
//uint32_t msec wraps @~50 days
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
#include <time.h> //struct timespec
#include <sys/time.h> //struct timeval, struct timezone
#include <time.h> //struct timespec
//using elapsed_t = uint32_t; //unsigned int;
#define timer_t  my_timer_t //kludge: avoid name conflict
template <unsigned int UNITS = (int)1e3, typename ELAPSED_T = uint32_t, unsigned int MAX_SEC = (ELAPSED_T)-1 / UNITS> //max value before wrap; 
//CAUTION: timer_t needs to be thread-safe; don't update shared/static members without protection
class timer_t
{
public: //types
//    using timeval_t = struct timeval;
    using elapsed_t = ELAPSED_T; //uint32_t; //unsigned int;
    static const elapsed_t max = MAX_SEC;
private: //members
    elapsed_t m_timeval;
public: //ctor/dtor
    inline timer_t(): timer_t(now()) {}
    inline timer_t(const elapsed_t& other): m_timeval(other) {} // { m_timeval.tv_sec = other.tv_sec; m_timeval.tv_usec = other.tv_usec; }
public: //operators
    inline operator const elapsed_t&() const { return m_timeval; }
public: //methods
    inline elapsed_t elapsed() const { elapsed_t no_update = m_timeval; return elapsed(no_update); }
//    inline elapsed_t elapsed() { return elapsed(m_timeval); }
public: //static methods
    /*static*/ elapsed_t elapsed(elapsed_t& update) const //{ return elapsed<UNITS>(m_timeval); }
    {
//        const bool want_update = !isConst(*this);
//        static timeval_t epoch = now; //set epoch first time called
//    if (init /*!started.tv_sec && !started.tv_usec && &started != &USE_EPOCH*/) { started = now; return 0; } //caller just wants to set start time, no diff
//    timeval_t& since = (&started == /*NULL_OF(timeval_t)*/ &USE_EPOCH)? epoch: started; //compare to caller vs. global epoch
//        const timeval_t& current = now();
        elapsed_t current = now();
//        diff -= (&started == /*NULL_OF(timeval_t)*/ &USE_EPOCH)? epoch: started; //compare to caller vs. global epoch
//        bool was_init = update.tv_sec || update.tv_usec;
//        timeval_t diff = was_init? current: update; //member-wise compare prev to current time
        elapsed_t diff = update? current - update: 0;
//        diff.tv_sec -= update.tv_sec;
//        diff.tv_usec -= update.tv_usec;
//        diff -= update;
        /*if (want_update)*/ update = current; //update compare basis for next time after diff
//    CONSTDEF(MAX_SEC, (int)((elapsed_t)-1 / UNITS)); //max value before wrap
//static int count = 0;
//if (!count++) printf("elapsed<%'d>: max sec %'u, diff %'d sec + %'d usec %s\n", UNITS, MAX_SEC, diff.tv_sec, diff.tv_usec, SRCLINEF);
//CAUTION: need to check for overflow *before* multiply (arm clamps to max uint32):
//        if (diff.tv_sec < 0 || diff.tv_sec >= MAX_SEC) fatal("%'d sec wrap @T+%'d sec; limit was %'u sec", UNITS, diff.tv_sec, MAX_SEC);
//        return diff.tv_sec * UNITS + diff.tv_usec / ((int)1e6 / UNITS);
        return diff;
    }
    static elapsed_t now()
    {
        struct timeval time_parts;
        static struct timezone& tz = *NULL_OF(struct timezone); //relative times don't need this
        if (gettimeofday(&time_parts, &tz)) fatal("get time of day failed");
        elapsed_t retval = time_parts.tv_sec * UNITS + time_parts.tv_usec / ((int)1e6 / UNITS); //could wrap but shouldn't matter if taking time diff
        return retval;
    }
//check if var is const:
//NOTE: this checks at run time
//std::is_const<> checks at compile-time
//    template <typename ... ARGS> shm(ARGS&& ... args): m_ptr(std::forward<ARGS>(args) ...)) {} //perfect fwd
//    template <typename T> bool isConst(T& x) { return false; }
//    template <typename T> bool isConst(T const& x) { return true; }
private: //dummy deps for fatal()
    static int thrinx() { return -1; }
    static struct { elapsed_t elapsed() { return -1; }} epoch;
};
#define delta_init(...)  UPTO_2ARGS(__VA_ARGS__, delta_init_2ARGS, delta_init_1ARG) (__VA_ARGS__)
#define delta_init_1ARG(epoch)  delta_init_2ARGS(epoch, now)
#define delta_init_2ARGS(epoch, now)  decltype(epoch)::elapsed_t now = epoch.elapsed(), chkpt = -now

#define delta(...)  UPTO_2ARGS(__VA_ARGS__, delta_2ARGS, delta_1ARG) (__VA_ARGS__)
#define delta_1ARG(epoch)  delta_2ARGS(epoch, now)
#define delta_2ARGS(epoch, now)  chkpt + (now = epoch.elapsed()); chkpt = -now

static const timer_t<(int)1e3> epoch; //set global start time (epoch), msec


//track last time src line was executed:
//used for debug dedup or perf
#include <map> //std::map<>
#include <utility> //std::pair<>
using line_elapsed_t = decltype(epoch)::elapsed_t; //timer_t<(int)1e3>::elapsed_t;
line_elapsed_t line_elapsed(int line)
{
    static std::map<int, line_elapsed_t> latest;
    line_elapsed_t now = epoch.elapsed(); //TODO: combine with debug(elapsed())?
    auto found = latest.find(line);
    line_elapsed_t retval = (found != latest.end())? now - found->second: 999e3; //now;
    latest[line] = now;
    return retval;
}


//reduce verbosity by using a unique small int instead of thread id:
#include <unistd.h> //close(), getpid(), usleep()
#include <thread> //std::thread::get_id(), std::thread()
//#include <condition_variable>
#include <mutex> //std:mutex<>, std::unique_lock<>
#include <vector> //std::vector<>
#include <atomic>  //std::atomic<>, std::atomic_wait(), std::atomic_notify_all()
//#if __cplusplus < 202000L //poly fill
//#endif
#define thrid()  std::this_thread::get_id()
using thrid_t = decltype(thrid()); //std::this_thread::get_id()) thrid_t;
//inline /*auto*/ /*std::thread::id*/ /*const std::thread::id&*/ thrid_t thrid()
//{
//TODO: add pid for multi-process uniqueness?
//    return std::this_thread::get_id();
//}
//int thrinx(/*const thrid_t&*/ /*std::thread::id*/ /*auto*/ thrid_t myid = thrid())
int thrinx(/*const thrid_t&*/ /*std::thread::id*/ /*auto*/ thrid_t myid = thrid()) //need fwd ref to allow circular deps
//moved here to resolve circular deps:
//int thrinx(/*const thrid_t&*/ /*std::thread::id*/ /*auto*/ thrid_t myid) // = thrid())
{
//TODO: move to shm?
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
//CAUTION: need to unlock before calling debug()
    debug("\n%s\nnew thread[%d] 0x%lx detected, pid %d", std::string(16, '.').c_str(), retval, myid, getpid()); //CAUTION: recursion into above section; okay if doesn't fall thru to here
    return retval;
}


//#elif _HOIST == HOIST_OTHER
// #undef _HOIST
//#define _HOIST  HOIST_WHATEVER
//#include __FILE__  //error here requires CD into folder or add "-I." to compile
#endif //def _HOIST
//eof
