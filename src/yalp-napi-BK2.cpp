///////////////////////////////////////////////////////////////////////////////
////
/// yalp-node-addon.cpp - YALP Node.js add-on; uses GPU as a 24-bit parallel port
// primary purpose: drive 24 channels of WS281X pixels using Node.js on a RPi, with low CPU overhead
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


#include <stdint.h> //uint32_t, etc.
#include "macro-vargs.h" //UPTO_#ARGS()


//#if __cplusplus < 201400L
// #pragma message("CAUTION: this file probably needs c++14 or later to compile correctly")
//#endif
#if __cplusplus < 201703L
 #error "sorry, need C++17 or later to compile"
//#else
// #pragma message("okay, using C++ " TOSTR(__cplusplus))
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
//wrapper for shm + function to update FB (dedicated bkg thread)
#include <unistd.h> //close(), getpid(), usleep()
#include <string.h> //strchr(), strstr()
#include <fcntl.h> //O_RDONLY
#include <stdio.h> //read()
class YALP
{
    CONSTDEF(NULLPX, 1); //kludge: GPIO seems to need a few usec to settle before sending data?
    CONSTDEF(PPB, 3); //enum { PPB = 3 };
    NAPI_START_EXPORTS(YALP);
    /*struct*/ shmdata_t<> m_shdata; //data shared between all instances (across threads + procs)
    CONSTDEF(NUMPORTS, m_shdata::NUMPORTS);
    using gpubits_t = uint32_t; //1 bit for each "port"; only 24 bits available in RGB value
    static_assert(NUMPORTS <= bytes2bits(sizeof(gpubits_t)));
public: //types
    using shmdata_t = typename decltype(m_shdata);
    using frbuf_t = typename decltype(m_shdata)::frbuf_t;
    using wsnode_t = typename decltype(m_shdata)::frbuf_t::wsnode_t;
private:
    AutoFB<gpubits_t> m_pxbuf;
    const size_t gaplen; //#px during hblank; should be 1
//    using px_t = decltype(m_pxbuf)::data_t;
public: //ctor/dtor
//    YALP(int fbnum): m_shdata(fbnum) {}
//    YALP(): YALP(-1) {};
    YALP(int fbnum = -1, const char* timing_ovr = 0, int want_debug = 0): m_shdata(choosefb(fbnum), timing_details(timing_ovr), want_debug), m_pxbuf(m_shdata.fbnum), gaplen(m_shdata.xtotal - m_shdata.xres)
    {
//        univlen_check();
        if (m_pxbuf.width() != m_shdata.xtotal) warn("raster rowlen32 %'lu != xtotal res %'d", pxbuf.rowlen32, m_shdata.xtotal);
        if (m_shdata.ppb() != PPB) fatal("%d ppb !implemented; should be %d", m_shdata.ppb(), PPB);
        if (gaplen != 1) fatal("gap len %d !implemented; should be 1", gaplen);
        timer_check(); //checks if time tracking will be accurate
        debug("YALP@0x%x ctor: fb# %d, #buf %d, shdata @0x%x, pid %d/thread %d", this, m_shdata.fbnum, m_shdata::NUMBUF, &m_shdata, getpid(), thrinx());
    }
    ~YALP()
    {
        debug("YALP@0x%x dtor: shdata @0x%x, pid %d/thread %d", this, &m_shdata, getpid(), thrinx());
    }
//shim for ctor optional args:
    struct opts_t
    {
//        decltype(m_shdata.fbdev) fbdev;
//        decltype(m_shdata.htotal) htotal;
//        decltype(m_shdata.vres) vres;
//        decltype(m_shdata.pxclk) pxclk;
//        std::string timing;
//        decltype(m_shdata.debug_level) debug_level;
        int fbnum;
        std::string timing_ovr; //const char* timing_override;
        int debug_level;
//ctor/dtor:
//        opts_t(): fbnum(-1), timing_override(0), debug_level(0) {}
        opts_t(int want_fbnum = -1, const char* str = 0, int want_debug = 0): fbnum(want_fbnum), timing_override(str), debug_level(want_debug) {};
//TODO: pull in named args shim
    };
    YALP(struct opts_t& opts): YALP(opts.fbnum, opts.timing_ovr.c_str(), opts.want_debug) {}
//ctor helpers:
#ifdef USING_NAPI
//ctor with JS args:
    Napi::Object frbuf_napi[shmdata_t::NUMBUFS];
    YALP(const Napi::CallbackInfo& info): YALP(opts_napi(info))
    {
//instantiate frbufs 1x, then return refs later (they'll be reused repeatedly):
        for (int i = 0; i < shmdata_t::NUMPPORTS; ++i)
//            frbuf_napi[i] = Napi::Object::New(info.Env());
//        return MyObject::NewInstance(info.Env(), info[0]);
//for cre JS obj within C, see https://github.com/nodejs/node-addon-examples/tree/master/8_passing_wrapped/node-addon-api
            frbuf_napi[i] = ExportedClass<frbuf_t>::NewInstance(info.Env(), args);
    }
    static struct opts_t& opts_napi(const Napi::CallbackInfo& info)
    {
        static struct opts_t c_opts;
        if (!info.Length()) return c_opts;
        if (info.Length() > 1 || (info.Length() && !info[0].IsObject())) return err_napi(info.Env(), "options (optional Object) expected; got: %d %s", info.Length(), NapiArgType(info, 0));
//        std::string timing_opt;
//https://github.com/nodejs/node-addon-api/blob/master/doc/object.md
//https://stackoverflow.com/questions/57885324/how-to-access-js-object-property-in-node-js-native-addon
        std::string unknopt;
        const /*auto*/ Napi::Object napi_opts = info[0].As<Napi::Object>().Value();
        Napi::Array names = napi_opts.GetPropertyNames();
        for (int i = 0; i < names.Length(); ++i)
        {
//                std::string name = (std::string)names.Get(names[i]).As<Napi::String>();
            const char* name = napi2val(names.Get(i));
            debug("updloop opt[%d/%d] '%s' %s", i, names.Length(), name/*.c_str()*/, NapiType(napi_opts.Get(name))); //names[i])));
            if (!strcmp(name, "fbnum")) c_opts.fbnum = napi2val(napi_opts.Get(name));
            else if (!strcmp(name, "timing")) c_opts.timing_ovr = napi2val(napi_opts.Get(name));
            else if (!strcmp(name, "debug")) c_opts.debug_level = napi2val(napi_opts.Get(name));
            else unknopt += ", " + NapiType(napi_opts.Get(name)) + " '" + name + "'";
        }
        if (unknopt.length()) return err_napi(info.Env(), "unknown option%s: %s", unknopt.c_str().strchr(',')? "s": "", unknopt.c_str() + 2);
        return c_opts;
    }
#endif
//try to find a valid framebuffer:
    static int choosefb(int fbnum)
    {
        if (fbnum != -1) return fbnum;
//start at highest (assumes dpi > hdmi/console)
        CONSTDEF(MAX_FB, 4);
        for (fbnum = MAX_FB -1; fbnum >= 1 -1; --fbnum)
        {
//            const char* name = fbdevname(fbnum);
//            char fbname[30];
//            snprintf(fbname, sizeof(fbname), "/dev/fb%d", fb);
//            if (!fexists(name)) continue; //silently ignore non-existent devices
            AutoFile fb(AutoFB<>::fbname(fbnum), O_RDWR);
            if (!fb.isOpen()) continue;
            log("no FB specified; using FB device# %d".brightCyan, fbnum);
            return fbnum;
        }
//        log("can't find FB device; setting to default %d".brightRed, m_shdata.fbdev);
//        throw std::runtime_error(strerror(errno));
        fatal(); //can't find suitable FB device
    }
//get timing details:
    static const char* timing_details(const char* timing_ovr)
    {
//        DebugScope ds("CFG::timing");
        if (timing_ovr && *timing_ovr) return timing_ovr;
        if (!isRPi()) return 0;
//try to get detailed timing (RPi only):
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
            debug("parse: '%s'", ifnull(found.c_str(), "??"));
            m_timing = res.suffix();
        }
        m_timing = ""; str = m_timing.c_str();
#endif //0
        static std::string str;
        str = shell("vcgencmd hdmi_timings");
        if (str.Length()) return str.c_str();
        str = shell("vcgencmd get_config dpi_timings");
        if (str.Length()) return str.c_str();
        return 0;
    }
//        if (isMainThread) m_frnum = m_ready = 0; //wkers can start on first frame immediately
private: //prop getters/setters, mostly for JS
//    inline decltype(m_shdata.frdev) frdev() const { return m_shdata.frdev; }
//    inline void frdev(decltype(m_shdata.frdev) newval) { m_shdata.frdev = newval; }
//#define GETTER(name, target)  decltype(target) name() const { return target; }
//#define SETTER(name, target)  void name(decltype(target) newval) { target = newval; }
//#define SETTERCB(name, cb)  void name(decltype(name()) newval) { cb(newval); }
//#define SETTER(...)  UPTO_3ARGS(__VA_ARGS__, SETTER_3ARGS, SETTER_2ARGS, missing_args) (__VA_ARGS__)
//#define SETTER_2ARGS(name, target)  void name(decltype(target) newval) { target = newval; }
//#define SETTER_3ARGS(name, target, logic)  void name(decltype(target) newval) { target = newval; }
//#define GETSETTER(name, target)  GETTER(name, target); SETTER(name, target)
//config info (read-only):
    inline GETTER(frtime_get, m_shdata.frtime_usec);
    NAPI_EXPORT_PROPERTY(YALP, "frtime", frtime_get);
    inline GETTER(univlen_get, m_shdata.univlen());
    NAPI_EXPORT_PROPERTY(YALP, "UNIV_LEN", univlen_get);
    inline GETTER(numports_get, m_shdata::NUM_PORTS); //.numports());
    NAPI_EXPORT_PROPERTY(YALP, "NUM_PORTS", numports_get);
    inline GETTER(univ_maxlen_get, m_shdata::MAX_UNIVLEN); //.univ_maxlen());
    NAPI_EXPORT_PROPERTY(YALP, "UNIV_MAXLEN", univ_maxlen_get);
//stats (read-only):
    inline GETTER(numfr_get, m_shdata.stats.numfr);
    NAPI_EXPORT_PROPERTY(YALP, "numfr", numfr_get);
//    inline GETTER(started_sec, m_shdata.stats.started[0]);
//    NAPI_EXPORT_PROPERTY(YALP, started_sec);
//    inline GETTER(started_usec, m_shdata.stats.started[1]);
//    NAPI_EXPORT_PROPERTY(YALP, started_usec);
    inline elapsed_t elapsed_msec() { return elapsed<(int)1e3>(m_shdata.stats.started_msec); }
    NAPI_EXPORT_PROPERTY(YALP, "elapsed_msec", elapsed_msec);
//low-level info (mostly read-only):
//    inline GETTER(lastbuf, m_shdata.lastbuf);
//    NAPI_EXPORT_PROPERTY(YALP, lastbuf);
    inline GETTER(fbnum_get, m_shdata.fbnum);
    NAPI_EXPORT_PROPERTY(YALP, "fbnum", fbnum_get);
    inline GETTER(bkgpid_get, m_shdata.bkgpid);
    inline SETTER(bkgpid_set, m_shdata.bkgpid); //watched by bkgloop; allow JS to cancel
    NAPI_EXPORT_PROPERTY(YALP, "bkgpid", bkgpid_get, bkgpid_set);
    inline GETTER(shmkey_get, m_shdata::SHMKEY); //.shmkey());
    NAPI_EXPORT_PROPERTY(YALP, "shmkey", shmkey_get); //backdoor access
    inline GETTER(numbuf_get, m_shdata::NUMBUFS); //.numbuf());
    NAPI_EXPORT_PROPERTY(YALP, "numbuf", numbuf_get);
    inline GETTER(fifo_get, m_shdata.oldest() - &m_shdata.frbufs[0]); //fifo());
    NAPI_EXPORT_PROPERTY(YALP, "fifo", fifo_get);
//state info (buf access), mostly read-only:
    inline GETTER(seqnum_get, m_shdata.oldest()->seqnum);
//    inline SETTERCB(seqnum, m_shdata.recycle); //update seq# invalidates cache
    NAPI_EXPORT_PROPERTY(YALP, "seqnum", seqnum_get);
    inline GETTER(timestamp_get, m_shdata.oldest()->timestamp);
    NAPI_EXPORT_PROPERTY(YALP, "timestamp", timestamp_get);
//    inline GETTER(dirty, m_shdata.oldest().dirty);
//    inline SETTER(dirty, m_shdata.oldest().dirty);
//    NAPI_EXPORT_PROPERTY(YALP, "dirty", dirty, dirty);
//#undef SETTERCB
//#undef SETTER
//#undef GETTER
//private: //frbuf methods
#ifdef USING_NAPI
    Napi::Value newer_method(const Napi::CallbackInfo& info)
    {
        if (info.Length() != 2 /*|| info.Length() > 3*/ || !info[0].IsNumber() || !info[1].IsNumber() /*|| (info.Length() > 2 && !info[2].IsNumber())*/) return err_napi(info.Env(), "seq# (Number) + timestamp (msec, Number) expected, got %d: %s %s %s", info.Length(), NapiArgType(info, 0), NapiArgType(info, 1)); //, NapiArgType(info, 2));
//        const auto seqnum = info[0].As<Napi::Number>().Uint32Value();
        const shmdata_t::seqnum_t seqnum = napi2val(info[0]);
//        const auto timestamp = info[1].As<Napi::Number>().Uint32Value();
        const shmdata_t::timestamp_t timestamp = napi2val(info[1]);
//        const auto univnum = (info.Length() > 2)? info[2].As<Napi::Number>().Uint32Value(): -1;
//        const shmdata_t::portnum_t portnum = (info.Length() > 2)? napi2val(info[2]): -1;
        auto /*shmdata_t::frbuf_t*/ fbptr = m_shdata.newer(seqnum, timestamp); //, portnum);
        if (!fbptr) return info.Env().Null(); //Napi::Number::New(info.Env(), 0);
        return fbptr2napi(fbptr, info);
    }
    NAPI_EXPORT_METHOD(YALP, "newer", newer_method);
    Napi::Value oldest_getter(const Napi::CallbackInfo &info)
    {
        auto fbptr = m_shdata.oldest();
        return fbptr2napi(fbptr, info);
    }
    NAPI_EXPORT_WRAPPED_PROPERTY(YALP, "oldest", oldest_getter);
//    NAPI_EXPORT(FBPixels, pixels);
//    Napi::Object ports_napi[NUMPORTS];
    Napi::Value fbptr2napi(frbuf_t* fbptr, const Napi::CallbackInfo &info)
    {
        int fifo = fbptr - &m_shdata.frbufs[0];
        static_assert(0 <= fifo && fifo < NUMBUFS);
//        return napi_frbuf_wrap(info.Env(), fbptr); //, univlen());
//#pragma message("FIX THIS")
//        return info.Env().Null(); //fbptr->napi_wrap(info.Env(), univlen());
        /*Napi::Value*/ auto frbufs_napi = frbufs_getter(info);
        auto retval = frbufs_napi[fifo];
        static_assert(info.Env() == retval.env);
        return retval; //frbuf_napi[fifo];
    }
    Napi::Value frbufs_getter(const Napi::CallbackInfo &info)
    {
//        static Napi::Object ports_napi[NUMPORTS];
//CAUTION: caller is responsible for setting dirty flag
//        Napi::Env env = info.Env();
//        auto retval = Napi::Array::New(info.Env(), h);
//CAUTION: restrict width to visible pixels
//        auto arybuf = Napi::ArrayBuffer::New(info.Env(), &wsnodes[0], sizeof(wsnodes)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
//        auto ary = Napi::TypedArrayOf<wsnode_t>::New(info.Env(), univlen(), arybuf, 0, napi_uint32_array); ////https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
//can't use TypedArray here
        static Napi::Value retary = Napi::Array::New(info.Env(), 0); //NUMPORTS);
        if (!retary.Length())
        {
            retary = Napi::Array::New(info.Env(), NUMBUFS);
            for (int i = 0; i < NUMBUFS; ++i)
            {
//for cre JS obj within C, see https://github.com/nodejs/node-addon-examples/tree/master/8_passing_wrapped/node-addon-api
//                Napi::Value port = ExportedClass<port_t>::NewInstance(info.Env(), args);
                Napi::Value frbuf = ExportedClass<frbuf_t>::Info.Env().GetInstanceData<Napi::FunctionReference>()->New(); //{arg});
                retval[i] = frbuf; //CAUTION: RPi needs y to be uint32_t
            }
        }
//?            retval.set(y, rowary);
//Buffer<t> Napi::Buffer<t>::New(env, data*, len);
//        static_assert();
        if (retary.env != info.Env()) return err_napi(info.Env(), "ret ary env mismatch: created in %d, accessed in %d", retary.env, info.Env());
        return retary;
    }
    NAPI_EXPORT_WRAPPED_PROPERTY(YALP, "frbufs", frbufs_getter); //TODO: hide this from JS?
#endif //def USING_NAPI
//public: //gpu loop methods
//    bool start();
    /*m_shdata::numfr_t*/ bool cancel()
    {
        bool was_running = m_shdata.bkgpid;
        m_shdata.bkgpid = 0;
        return was_running; //m_shdata.stats.numfr;
    }
private: //helpers:
//pivot+update loop:
//NOTE: must not be run on main thread! (due to blocking)
    shmdata_t::numfr_t updloop()
    {
        shmdata_t::numfr_t didfr = m_shdata.numfr;
        while (isRunning()) usleep(50e3); //poll until other instance completes; TODO: use mutex/cond_var/signal?
        if (m_shdata.numfr == didfr) //bkg job !running; start new loop
        {
            m_shdata.bkgpid = getpid(); //sets isRunning = true
            debug("updloop %s: pid %d, fbnum %d open? %d", didfr? "resume": "start", getpid(), m_shdata.fbnum, fb.isOpen());
            if (!didfr) //fresh start: clear stats
            {
                elapsed<(int)1e3>(m_shdata.stats.started_msec);
                m_shdata.stats.busytime = m_shdata.stats.idletime = 0;
            }
            timeval_t now_usec; elapsed<(int)1e6>(now_usec);
//            AutoClose fb(AutoClfbopen());
//            for (int i = 0; i < m_shdata.numbuf(); ++i) m_shdata.oldest()->recycle(0);
            while (isRunning())
            {
                if (!fb.isOpen()) break;
                auto fbptr = m_shdata->oldest();
                /*if (fbptr->dirty)*/ pivot24(fbptr);
                fbptr->recycle();
                ++m_shdata.stats.numfr;
//                if (!isOpen())
//                if (!wait4sync(fd, m_shdata.frtime)) break;
                /*elapsed_t busy_usec =*/ m_shdata.stats.busytime += elapsed<(int)1e6>(now_usec);
                wait4sync(fb);
                /*elapsed_t wait_usec =*/ m_shdata.stats.idletime += elapsed<(int)1e6>(now_usec);
            }
            m_shdata.bkgpid = 0; //isRunning = false
//            if (isOpen()) close(fd);
        }
        return m_shdata.numfr - didfr; //#frames processed
    }
#ifdef USING_NAPI
//run pivot/update loop on bkg thread:
    Napi::Value updloop_method(const Napi::CallbackInfo& info)
    {
        if (info.Length()) return err_napi(info.Env(), "args !expected; got: %d %s", info.Length(), NapiArgType(info, 0));
        auto async_exec = [this]() -> int { return updloop(); }; //run on bkg thread so main thread doesn't block
        NAPI_ASYNC_RETURN(async_exec);
    }
    NAPI_EXPORT_METHOD(SyncTest, "updloop", updloop_method);
    Napi::Value cancel_method(const Napi::CallbackInfo& info)
    {
        if (info.Length()) return err_napi(info.Env(), "args !expected; got: %d %s", info.Length(), NapiArgType(info, 0));
        return Napi::Boolean::New(info.Env(), cancel());
    }
    NAPI_EXPORT_METHOD(SyncTest, "cancel", cancel_method);
#endif //def USING_NAPI
//rotate 24 separate bit planes ("ports") into 24-bit RGB values:
//NOTE: (perf) this is hard-coded for WS281X protocol at 3 ppb (2.4MHz); see previous version for variants
//CAUTION: px24 ptr needs to account for imaginary (hblank) pixels because they affect timing
//instead of alloc extra memory for imaginary pixels, just let ptr wrap to next display line and then bump it back to start of line after writing imaginary pixels
// 0..xres..xtotal
// +-------+---+
// |       |iii|
// |III    |   |  imaginary pixels written at III, should be at iii but no memory is there
// +-------+   |
// |           |
// +-----------+
//    using px24_t = typename decltype(m_pxbuf)::data_t;
//    using wsnode_t = decltype(m_shdata)::wsnode_t;
//    using port_t = typename decltype(m_shdata)::port_t;
    CONSTDEF(NODEMSB, 1 << (m_shdata::NUMPORTS - 1));
    CONSTDEF(WHITE, 0xFFffffff); //ARGB value
//    static constexpr int bitmasks[] = 
//    {
//        0x800000, 0x400000, 0x200000, 0x100000, 0x80000, 0x40000, 0x20000, 0x10000, //R7..R0
//        0x8000, 0x4000, 0x2000, 0x1000, 0x800, 0x400, 0x200, 0x100, //G7..G0
//        0x80, 0x40, 0x20, 0x10, 8, 4, 2, 1, //B7..B0
//            0 //dummy entry to allow trailing comma above (Javascript-like convenence)
//    };
//#define PORTBIT(p)  (NODEMSB >> ((((p) / 8) * 16) + 8 - (p) - 1))
    static constexpr int flip(int val, int limit) { return limit - val - 1; } //CAUTION: !clamped
    static constexpr gpubits_t PORTBIT(int p) { return NODEMSB >> ((p & ~7) + flip(p & 7, 8)); }
    void pivot24_3ppb(frbuf_t* fbptr, int want_debug = 0)
    {
static int debug2 = 0;
if (!debug2++) for (int i = 0; i < 32; ++i) debug("portbit[%d] = 0x%x", i, PORTBIT(i));
        timeval_t started_usec; elapsed<(int)1e6>(started_usec);
        gpubits_t active = Abits(WHITE); //WS281X data can start at different times for each port; keep a bitmap
        unsigned short limits[NUMPORTS], dirtyofs[NUMPORTS]; //(perf) try to localize mem access
        for (int u = 0; u < NUMPORTS; ++u)
        {
            port_t* fbp = &fbptr->ports[u];
            if ((limits[u] = fbp->brlimit) >= 3 * 255) limits[u] = 0; //no limit
            dirtyofs[u] = fbp->last_dirty? fbp->first_dirty: -1; //set past eof if no last (disables stream on that port)
        }
        gpubits_t* bp24 = &m_pxbuf[0][0]; //.pixels();
        gpubits_t* gap = &m_pxbuf[0][m_shdata.resx];
//        const int gaplen = m_shdata.xtotal - m_shdata.xres; //should be 1
        for (int i = 0; i < NULLPX * PPB; ++i) *bp24++ = 0; //NOTE: assumes NULLPX < rowlen (no address gaps)
        for (int xy = 0; xy < m_shdata.univlen(); ++xy) //fill L2R, T2B
        {
//pivot next node in each port:
//(perf) localize mem access by loading next block of 24 bits onto stack
            wsnode_t portnodes[NUMPORTS]; //1 node per port
//            for (port_t* fbp = &fbptr->ports[u], ubit = 
            for (int u = 0; u < NUMPORTS; ++u)
            {
                port_t* fbp = &fbptr->ports[u];
                portnodes[u] = limit(fbp->wsnodes[xy], limits[u]); //enforce reduced brightness here in case client forgets or has bugs
                if (portnodes[u] && (want_debug-- > 0)) debug("to pivot: portbits[univ %'d][xy %'d] 0x%x limit %d = 0x%x", u, xy, fbp->wsnodes[xy], limits[u], portnodes[u]);
                if (xy != dirty[u]) continue; //no change in stream state
                gpubits_t ubit = NODEMSB >> u;
                active ^= ubit; //start/stop stream for this port
                if (active & ubit) dirty[u] = fbp->last_dirty; //if stream started, get end ofs
                if (want_debug-- > 0)) debug("%s port %d at node ofs %'d", (active & ubit)? "starting": "stopping", u, xy);
            }
            for (gpubits_t ubit = NODEMSB; ubit; ubit >>= 1) //render all gpu data bits
            {
//pivot node bits for each port into GPU px:
//each port represents a different RGB bit
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
                    ((portnodes[23] & ubit)? PORTBIT(23): 0);
#if 1 //debug
//            if ((px24ptr < &pixels[0][0]) || (px24ptr >= &pixels[height()][0]))
//                RETURN(errmsg("pivot loop[%'d/%'d] bad: bp24 %px scrv. pixels@ %p..%p", x, m_chqbytes, px24ptr, px24));
                if (Abits(px24)) fatal("pivot turned on non-RGB bit at node[%'d]: 0x%x", xy, Abits(px24)));
//            if (m_debug_pivot && RGBbits(px24)) debug("pivoted qb[%'d]/px[%'d of %'d] = 0x%x doing bit 0x%x", x, px24ptr - &pixels[0][0], &pixels[NUMCH][0]) - &pixels[0][0], px24, bit);
                if ((want_debug > 0) && RGBbits(px24) && (want_debug-- > 0)) debug("gpu data[%'d] bit 0x%x = 0x%x", xy, ubit, px24);
#endif //1
                px24 |= Abits(WHITE);
//NOTE: each (set of 24) wsnodes genertes 3 * 24 = 72 gpu px, but only need to check every 3rd for wrap
                if (bp24 == gap) fatal("start bits will go into gap");
                *bp24++ = active; // | Abits(WHITE); //only set start bit for active ports
                if (bp24 == gap) fatal("data bits will go into gap");
                *bp24++ = (px24 & active); // | Abits(WHITE); //*++; //1:1 to output px (but pivoted); 24 channel bits are in RGB positions, set alpha so px will be displayed, but only send data for active (dirty) ports
                if (bp24 == gap) { bp24 += gaplen; gap += m_pxbuf.width(); }
                else *bp24++ = BLACK; //0 | Abits(WHITE); //all ports get stop bit
            }
        }
        size_t xyofs = (NULLPX + univlen) * PPB;
        int y = xyofs / m_shdata.xtotal, x = xyofs % m_shdata.xtotal;
        if (bp24 != &m_pxbuf[y][x]) fatal("bp24 0x%x didn't land on px[y %'d][x %'d] 0x%x @eoframe", bp24, y, x, &m_pxbuf[y][x]);
        if (want_debug-- > 0) debug("pivot %'d nodes onto %'d x %'d canvas took %'d usec, active 0x%x @eof", univlen, m_pxbuf.width(), m_pxbuf.height(), elapsed<(int)1e6>(started_usec), active);
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
        if (br <= LIMIT3/*_BRIGHTNESS * 3*/) return color;
//    return toARGB(A(color), r, g, b);
//linear calculation is more efficient but less accurate than HSV conversion+adjust:
        int dimr = r * LIMIT3/*_BRIGHTNESS * 3*/ / br;
        int dimg = g * LIMIT3/*_BRIGHTNESS * 3*/ / br;
        int dimb = b * LIMIT3/*_BRIGHTNESS * 3*/ / br;
//debug("r %d * %d / %d => %d, g %d * %d / %d => %d, b %d * %d / %d => %d", r, 3 * LIMIT_BRIGHTNESS, br, dimr, g, 3 * LIMIT_BRIGHTNESS, br, dimg, b, 3 * LIMIT_BRIGHTNESS, br, dimb);
        return Abits(color) | (dimr << 16) | (dimg << 8) | (dimb << 0); //don't need clamp()
    }
//check timer accuracy:
    static void timer_check()
    {
//        usec_t started = now_usec();
        timeval_t started_usec; elapsed<(int)1e6>(started_usec); //now_msec(started);
        usleep(100e3);
//        int elapsed = delta_usec(started); //(now_latest.tv_sec - started.tv_sec) * 1e6 + now_latest.tv_usec - started.tv_usec;
        debug("timer calibration: sleep(100 msec) took %'d usec", elapsed<(int)1e6>(started_usec)); //now_usec() - started);
//        return elapsed;
    }
//check updloop status:
//check process status by pid: R=running, S=sleeping(most will be), T=terminated, Z=zombie, D=disk sleep, X=dead; https://linux.die.net/man/5/proc https://gitlab.com/procps-ng/procps
    inline bool isrunning() { return strchr("RS", proc_status(m_shdata.bkgpid)); }
    static char proc_status(int pid)
    {
         if (!pid) return '\0';
         AutoFile bkg(strprintf("/proc/%d/status", pid), O_RDONLY);
//         char buf[500]; //filename[50];
//         snprintf(buf, sizeof(buf), "/proc/%d/status", pid);
//         int fd = open(buf, O_RDONLY, 0);
         if (!bkg.isOpen()) return '\0';
         char buf[500];
         int num_read = read(bkg, buf, sizeof(buf));
//         close(fd);
         if (num_read < 1) return '\0';
         const char* bp = strstr(buf, "State:\t");
         return bp? bp[1]: '\0';
    }
    NAPI_STOP_EXPORTS(YALP); //public
};
NAPI_EXPORT_CLASS(YALP);


//allow JS to use my debug:
#ifdef USING_NAPI
#pragma message(YELLOW_MSG "TODO: also fatal()")
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
//prevout = printf("\n" fmt " %s" SRCLINE ENDCOLOR_NEWLINE + (prevout > 0), __VA_ARGS__, rti())
    debug("%s", str.c_str());
    return info.Length()? info[0]: info.Env().Undefined(); //allow inline debug()
}
#endif //def USING_NAPI


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
template <int GPUBITS = 24>
//struct scrinfo
class scrinfo_t
{
public:
//    using PSEC2USEC = 1000000; //1e6;
//    static constexpr int PSEC2USEC = 1e6;
//    enum { USEC2PSEC = (int)1e6 }; //1000000 };
//    using WSNODE_TIME = 30; //predetermined by WS281x protocol; fixed @30 usec/wsnode
//    enum { WSNODE_USEC = 30 }; //predetermined by WS281x protocol; fixed @30 usec/wsnode
    CONSTDEF(WSNODE_USEC, 30); //predetermined by WS281x protocol; fixed @30 usec/wsnode
//    static constexpr double WSTIME = 30e-6; //predetermined by WS281x protocol; 30usec/wsnode
//    using WSBITS = 24; //predetermined by protocol; fixed @24 bits/node
//    enum { WSBITS = 24 }; //predetermined by protocol; fixed @24 bits/node
    CONSTDEF(WSBITS, 24); //predetermined by protocol; fixed @24 bits/node
    CONSTDEF(NUMPORTS, GPUBITS);
    struct my_var_screeninfo: /*struct*/ fb_var_screeninfo
    {
        int fbnum; //tag screen info with FB device#
//add helpers:
        inline int xtotal() const { return xres + right_margin + hsync_len + left_margin; }
        inline int ytotal() const { return yres + lower_margin + vsync_len + upper_margin; }
        inline int frtime_usec() const { return (int)(double)pixclock * xtotal() / 1e3 * ytotal() / 1e3; } //psec -> usec; kludge: split up 1e6 factor to prevent overflow
        inline float fps() const { return 1e6 / frtime_usec(); }
    };
//    static constexpr int WSBITS = 24; //predetermined by protocol; 24 bits/node
    int fbnum; //fb device#
//    int debug_level; //put this in here to allow select debug at this level
//    uint32_t width; //#univ/channels/planes
//    uint32_t height; //univ len; max #nodes 
    int xres, xtotal; //visible + total hres (incl blank/sync)
    int yres, ytotal; //visible + total vres (incl blank/sync)
    int pxclock; //pix clock (psec)
//    int rgbbits; //#R+G+B bits
    inline bool isvalid() const { return xtotal && ytotal && pxclock; }
    inline int ppb(int scale = 1) const { return pxclock? usec2psec(WSNODE_USEC) / WSBITS * scale / pxclock: 0; } //scale allows caller to check exactness
//        uint32_t frtime; //usec/frame; derive fps from this
    inline int frtime_usec() const
    {
        static decltype(frtime_usec()) cached = (int)(double)pxclock * xtotal / 1e3 * ytotal / 1e3; //usec; kludge: split up 1e6 factor to prevent overflow
//        if (frnum != -1) return cached * frnum / 1e3; //CAUTION: usec => msec
        return cached;
    }
    inline int frtime_msec(int frnum) const { return frtime_usec() * frnum / 1e3; } //CAUTION: usec => msec to extend range
    inline int frnum(int time_msec) const { return time_msec / frtime_usec() / 1e3; }
    inline float fps() const { return 1e6 / frtime_usec(); }
    static constexpr int fps2nodes(int fps) { return (int)1e6 / fps / WSNODE_USEC; }
//max WS281X universe len with given screen resolution:
    inline size_t univlen() const
    {
        static decltype(univlen()) cached = xtotal * yres / WSBITS / ppb(); //NOTE: hblank counts because it interleaves visible data (bits will be 0 during hblank); vblank !counted because occurs after all node data (reset period)
        static bool valid = univlen_check(); //use "static" to check 1x
        return cached;
    }
//        size_t univ_len; //#ws nodes
//    struct fix_screeninfo scrf;
public: //ctor/dtor:
//no: require config!    timing() {}
//NOTE: caller *must* a select fb#; no default here
    scrinfo_t(int fbnum, int want_debug = 0): scrinfo_t(fbnum2info(fbnum, want_debug), want_debug) {}
    scrinfo_t(int fbnum, const char* timing, int want_debug = 0): scrinfo_t(timing_override(fbnum, timing, want_debug), want_debug) {}
    scrinfo_t(const struct my_var_screeninfo& scrv, int want_debug = 0): fbnum(scrv.fbnum), xres(scrv.xres), xtotal(scrv.xtotal()), yres(scrv.yres), ytotal(scrv.ytotal), pxclock(scrv.pixclock) //, rgbbits(scrv.red.length + scrv.green.length + scrv.blue.length)
    {
//        fbnum = scrv.fbnum;
//use, !save:        debug_level = want_debug;
//        xres = scrv.xres; xtotal = scrv.xtotal(); //right_margin + scrv.hsync_len + scrv.left_margin + xres = scrv->xres;
//        yres = scrv.yres; ytotal = scrv.ytotal(); //lower_margin + scrv.vsync_len + scrv.upper_margin + yres = scrv->yres;
//each YALP "universe" (port) of WS281X nodes is a GPU RGB bit plane:
        if (scrv.red.length + scrv.green.length + scrv.blue.length != GPUBITS) fatal("unsupported RGB config on FB#%d: %d+%d+%d = %d, expected %d", scrv.fbnum, scrv.red.length, scrv.green.length, scrv.blue.length, scrv.red.length + scrv.green.length + scrv.blue.length, GPUBITS);
        if (scrv.red.length != GPUBITS/3 || scrv.green.length != GPUBITS/3 || scrv.blue.length != GPUBITS/3) warn("strange RGB config on FB#%d: %d+%d+%d, expected %d each", scrv.fbnum, scrv.red.length, scrv.green.length, scrv.blue.length, GPUBITS/3);
//measure it anyway        if (scrv.pixclock) return;
//kludge: try to measure pix clock:
        AutoFile fb(AutoFB<>::fbname(fbnum), O_RDWR);
        if (!fb.isOpen()) fatal(); //throw std::runtime_error(std::string(strerror(errno)));
        wait4sync(fb); //wait until start of next frame to get clean stats
        timeval_t started_usec; elapsed<(int)1e6>(started_usec); //elapsed_usec(started); //save start time
        int frames = 0;
        CONSTDEF(NUMFR, 40); //CAUTION: elapsed time in usec must stay under ~ 2 sec to avoid overflow; 40 frames @60Hz ~= 667K, @30Hz ~= 1.3M, @20Hz == 2M usec
        while (frames++ < NUMFR) wait4sync(fb);
        pxclock = (long long)elapsed<(int)1e6>(started_usec) * 1e6 / NUMFR; //use long long for max accuracy
//        if (elapsed >= MAX_ELAPSED || !pxclock) fatal("can't measure px clock: %d frames => elapsed %u vs max %u usec", NUMFR, elapsed, MAX_ELAPSED);
debug("measureed pix clock: %'d usec / %'d fr = %'d psec/fr vs scr info %'d", elapsed<(int)1e6>(started_usec), NUMFR, pxclock, scrv.pixclock);
    }
//methods:
    static bool wait4sync(int fd, elapsed_t fallback_usec = 0)
    {
        int arg = 0; //must be 0
        if (ioctl(fd, FBIO_WAITFORVSYNC, &arg) >= 0) return true;
        if (!fallback_usec) fatal(); //throw std::runtime_error(std::string(strerror(errno)));
//TODO? adaptive vsync, OMAPFB_WAITFORVSYNC_FRAME
//    inline int getline()
//    {
//        int counter;
//        return (isOpen() && ioctl(m_fd, OMAPFB_GET_LINE_STATUS, &counter))? counter: -1;
//    }
//        static unsigned int arg = 0;
//        ioctl(fbdev, FBIO_WAITFORVSYNC, &arg);
//        if (!fallback_usec) fallback_usec = 10e3; //wait >= 1 msec so CPU doesn't get too busy
        usleep(fallback_usec); //kludge: try to maintain timing
        return false;
    }
//helpers:
    static struct my_var_screeninfo& fbnum2info(int fbnum, int want_debug = 0)
    {
        static struct my_var_screeninfo scrv;
        AutoFile fb(AutoFB<>::fbname(fbnum), O_RDWR);
        if (!fb.isOpen()) fatal(); //throw std::runtime_error(std::string(strerror(errno)));
        if (ioctl(fb, FBIOGET_VSCREENINFO, &scrv) < 0) fatal(); //throw std::runtime_error(std::string(strerror(errno)));
        scrv.fbnum = fbnum; //tag with device#
        return scrv;
    }
//parse timing override (hdmi/dpi line from RPi /boot/config.txt):
    static struct my_var_screeninfo& timing_override(int fbnum, const char* str, int want_debug = 0)
    {
//        static struct my_var_screeninfo defscrv;
        struct my_var_screeninfo& scrv = fbnum2info(fbnum); //default values
        if (!str || !*str) return scrv; //use system-defined values
//        AutoClose fb(fbname(fbnum), O_RDWR);
//        if (!fb.isOpen()) throw std::runtime_error(std::string(strerror(errno)));
//        if (ioctl(fb, FBIOGET_VSCREENINFO, &scrv) < 0) throw std::runtime_error(std::string(strerror(errno)));
        int xres = 0, xsync = 0, xfront = 0, xback = 0;
        int yres = 0, yfront = 0, ysync = 0, yback = 0;
        int fps = 0, pxclock = 0;
//        int xfront = 0, xback = 0, yfront = 0, yback = 0;
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
        pxclock /= 1e3; //Hz => KHz
        if (!xres || !yres || !clock /*!isvalid()*/) fatal("invalid timing: '%s' (xres %d, yres %d, clock %d cannot be 0)", str_fixup, xres, yres, pxclock);
//no        xsync += xfront + xback; //consolidate for simpler calculations
//no        ysync += yfront + yback;
//        m_scrinfo.isvalid = true;
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
        warn("timing override fb#%d: hres %'d + %'d+%'d+%'d, yres %'d + %'d+%'d+%'d, fps %'d, clk %'d KHz, changed: %s", fbnum, xres, xfront, xsync, xback, yres, yfront, ysync, yback, fps, pxclock, changes.c_str() + 2);
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
        if (ppb_check % SCALE) warnings = warn("non-integral %3.2f px/bit results in timing jitter", (double)ppb_check / SCALE); //WSTIME * scrv.pixclock * 1e3 / WSBITS);
        ppb_check = rdiv(ppb_check, SCALE); //scale back to true value
        if (ppb_check < 3) fatal("ppb %d insufficient resolution to render WS281x data; must be >= 3", ppb_check);
#if 1 //Nov 2020: standardize on 3 ppb @2.4MHz (SPI-style); dev can still use this (windowed)
        if (ppb_check != 3) fatal("ppb %d !implemented; must be 3", ppb_check);
        if (xtotal - xres != 1) fatal("expected xtotal %'d = xres %'d + 1 for 3 ppb", xtotal, xres);
        if (pxclock != psec2KHz(WSFREQ)) fatal("pixclock %'d KHz !implemented; must be %'d KHz", psec2KHz(pxclock), WSFREQ);
#endif
//misc other (res) checks:
        if (xres & 1) warnings = warn("non-even xres %'d can cause timing jitter (RPi GPU limitation)", xres);
        int vblank = ytotal - yres, xblank = xtotal - xres;
//    size_t univlen_pad = (((scrv.xtotal() * scrv.yres - NULLPX) / WSBITS / m_ppb) * sizeof(wsnode_t) / CACHELEN) * CACHELEN / sizeof(wsnode_t); //bits -> bytes; minimize cache contention for mult-threaded apps
//        debug("WS281x univlen: (hres %'u + hblank %'u) * vres %'u = %'u bit times/ch/fr = %'d wsnode/ch/fr @%'d px/bit, pad %'d bytes => %'lu wsnodes/channel", 
//    "target limit %'d wsnodes/ch/fr (%'d bytes), "
//"bit clk %'lu KHz (%'d psec), hblank = %2.1f ws bits, vblank = %'d usec", 
//scrv.xres, scrv.xtotal() - scrv.xres, scrv.yres, scrv.xtotal() * scrv.yres, scrv.xtotal() * scrv.yres / WSBITS / m_ppb, m_ppb, CACHELEN, univlen_pad, 
//psec2KHz(scrv.pixclock), scrv.pixclock, (double)(scrv.xtotal() - scrv.xres) / m_ppb, (int)rdiv(scrv.xtotal() * vblank * scrv.pixclock, psec2usec));
//protocol limit: signal low (stop bit) must be < 50% data bit time
//this allows ws data stream to span hblank without interruption
        if (2 * xblank >= ppb_check) warnings = warn("hblank (%'d px) too long: exceeds WS281x 50%% data bit time (%'d px)", xtotal - xres, rdiv(ppb_check, 2));
        if (!vblank /*(xtotal * vblank) / scrv.pixclock / 1e3 < 50*/) warnings = warn("vblank (%'lu lines) too short: WS281x needs at least 50 usec (1 scan line)", vblank); //, 50e3 * scrv.pixclock / xtotal);
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


//port info:
//a "port" is one GPIO pin, corresponding to one RGB bit (via dpi24)
//use atomics to reduce locking
//CAUTION: JS should use Atomic() to access port{} if multiple threads are active
//use getters/setters so caller has up-to-date values and/or can share across threads + procs
//struct shmdata: /*public*/ scrinfo_t //struct scrinfo
#include <atomic> //std::atomic<>
//#include "napi-helpers.h" //misc napi defs
// /*typedef*/ struct
template<int UNIV_MAXLEN = scrinfo_t::fps2nodes(MIN_FPS), int MIN_FPS = 10>
class alignas(CACHELEN) port_t //reduce cache contention between threads
{
    using wsnode_t = uint32_t;
    NAPI_START_EXPORTS(port_t);
public:
//            data_t dirty[2]; //first + last dirty node ofs
    std::atomic<int> brlimit; //one value per port avoids bulky node address checking; props on a port tend to be similar anyway
    inline AGETTER(brlimit); inline ASETTER(brlimit); //atomic shims
//            NAPI_PROPDESC(port_s ignored, limit_propdesc, limit, limit);
    NAPI_EXPORT_PROPERTY(port_t, "brlimit", aget_brlimit, aset_brlimit);
    std::atomic<size_t> first_dirty, last_dirty; //first + last dirty node ofs; allows data stream to be shortened on either end; more importantly, avoids unnecessary node updates in render threads
    inline AGETTER(first_dirty); inline ASETTER(first_dirty); //atomic shims
//            NAPI_PROPDESC(port_s ignored, first_dirty_propdesc, first_dirty, first_dirty);
    inline AGETTER(last_dirty); inline ASETTER(last_dirty); //atomic shims
//            NAPI_PROPDESC(port_s ignroed, last_dirty_propdesc, last_dirty, last_dirty);
    NAPI_EXPORT_PROPERTY(port_t, "first_dirty", aget_first_dirty, aset_first_dirty);
    NAPI_EXPORT_PROPERTY(port_t, "last_dirty", aget_last_dirty, aset_last_dirty);
//            using dirty_t = decltype(dirty[0]);
    wsnode_t wsnodes[UNIV_MAXLEN]; //start of WS node data
//            using wsnode_t = decltype(wsnodes[0]);
#ifdef USING_NAPI
//    NAPI_EXPORT(FBPixels, pixels);
    Napi::Value wsnodes_getter(const Napi::CallbackInfo &info)
    {
//CAUTION: caller is responsible for setting dirty flag
//        Napi::Env env = info.Env();
//        auto retval = Napi::Array::New(info.Env(), h);
//CAUTION: restrict width to visible pixels
        auto arybuf = Napi::ArrayBuffer::New(info.Env(), &wsnodes[0], sizeof(wsnodes)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
        auto ary = Napi::TypedArrayOf<wsnode_t>::New(info.Env(), univlen(), arybuf, 0, napi_uint32_array); ////https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
//?            retval.set(y, rowary);
//Buffer<t> Napi::Buffer<t>::New(env, data*, len);
        return ary;
    }
    NAPI_EXPORT_WRAPPED_PROPERTY(port_t, "wsnodes", wsnodes_getter);
#endif //def USING_NAPI
#if 0 //def USING_NAPI
    void napi_wrap(Napi::Object retval, Napi::ArrayBuffer arybuf, int portnum, int len)
    {
//            NAPI_ADD_OBJPROP(retval, "limit", get_limit, set_limit);
//                add_objprop_limit(retval);
        retval.DefineProperty(limit_propdesc);
//                    port.set("first_dirty", get_first_dirty, set_first_dirty);
//            NAPI_ADD_OBJPROP(retval, "first_dirty", get_first_dirty, set_first_dirty);
        retval.DefineProperty(first_dirty_propdesc);
//                    port.set("last_dirty", get_last_dirty, set_last_dirty);
//            NAPI_ADD_OBJPROP(retval, "last_dirty", get_last_dirty, set_last_dirty);
        retval.DefineProperty(last_dirty_propdesc);
        auto nodes = Napi::TypedArrayOf<wsnode_t>::New(env, len, arybuf, portnum * sizeof(ports[0]), napi_uint32_array); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md; //NOTE: wsnodes[] might be padded due to alignas()
        retval.set("wsnodes", nodes);
    }
#endif //def USING_NAPI
//    using port_t = std::remove_cvref_t<decltype(ports[0])>;
//    using portnum_t = int;
    using brlimit_t = decltype(brlimit)::value_type;
    using dirty_t = decltype(first_dirty)::value_type;
//    using wsnode_t = std::remove_cvref_t<decltype(ports[0].wsnodes[0])>;
//    inline port_t* pptr(int n) const { return &ports[n % NUMPORTS]; }
    NAPI_STOP_EXPORTS(port_t); //public
};
NAPI_EXPORT_CLASS(port_t);


//frbuf:
//struct shmdata: /*public*/ scrinfo_t //struct scrinfo
#include <atomic>
// /*typedef*/ struct //frbuf_s
class frbuf_t
{
    NAPI_START_EXPORTS(frbuf_t);
    CONSTDEF(NUMPORTS, scrinfo_t::NUMPORTS);
public: //properties
//??        NAPI_START_EXPORTS(frbuf_t);
//        using seqnum_t = uint32_t; //decltype(seqnum);
    std::atomic<uint32_t> seqnum; //cycle#/song#; bump when rewinding timestamp
    inline AGETTER(seqnum); inline ASETTER(seqnum); //atomic shims
    NAPI_EXPORT_PROPERTY(frbuf_t, "seqnum", aget_seqnum, aset_seqnum);
//        NAPI_PROPDESC(frbuf_t ignored, seqnum_propdesc, seqnum, seqnum);
//        NAPI_PROPDESC(frbuf_s, seqnum_propdesc, seqnum, seqnum);
//        using timestamp_t = msec_t; //decltype(timestamp);
    std::atomic<elapsed_t> timestamp_msec; //when to show this frame rel to seq start (msec); wraps @~1.2 hr
    inline AGETTER(timestamp_msec); //atomic shim
    NAPI_EXPORT_PROPERTY(frbuf_t, "timestamp", aget_timestamp_msec);
//        NAPI_PROPDESC(frbuf_t ignored, timestamp_propdesc, timestamp);
//        NAPI_PROPDESC(frbuf_s, timestamp_propdesc, timestamp);
//        static_assert(sizeof(seqnum) == sizeof(data_t));
//        static_assert(sizeof(timestamp) == sizeof(data_t));
//        std::atomic<uint32_t> dirty; //avoids redundant FB updates; bitmap of univ#
//        std::atomic<uint32_t> dirty[NUMPORTS][2]; //first + last dirty node ofs per port
    port_t ports[NUMPORTS];
//TODO: export port inx and allow single port to be returned?  simpler for JS caller but more overhead in here
#ifdef USING_NAPI
//    NAPI_EXPORT(FBPixels, pixels);
//    Napi::Object ports_napi[NUMPORTS];
    Napi::Value ports_getter(const Napi::CallbackInfo &info)
    {
//        static Napi::Object ports_napi[NUMPORTS];
//CAUTION: caller is responsible for setting dirty flag
//        Napi::Env env = info.Env();
//        auto retval = Napi::Array::New(info.Env(), h);
//CAUTION: restrict width to visible pixels
//        auto arybuf = Napi::ArrayBuffer::New(info.Env(), &wsnodes[0], sizeof(wsnodes)); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
//        auto ary = Napi::TypedArrayOf<wsnode_t>::New(info.Env(), univlen(), arybuf, 0, napi_uint32_array); ////https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md
//can't use TypedArray here
        static Napi::Value retary = Napi::Array::New(info.Env(), 0); //NUMPORTS);
        if (!retary.Length())
        {
            retary = Napi::Array::New(info.Env(), NUMPORTS);
            for (int i = 0; i < NUMPORTS; ++i)
            {
//for cre JS obj within C, see https://github.com/nodejs/node-addon-examples/tree/master/8_passing_wrapped/node-addon-api
//                Napi::Value port = ExportedClass<port_t>::NewInstance(info.Env(), args);
                Napi::Value port = ExportedClass<port_t>::Info.Env().GetInstanceData<Napi::FunctionReference>()->New(); //{arg});
                retval[i] = port; //CAUTION: RPi needs y to be uint32_t
            }
        }
//?            retval.set(y, rowary);
//Buffer<t> Napi::Buffer<t>::New(env, data*, len);
//        static_assert();
        if (retary.env != info.Env()) return err_napi(info.Env(), "ret ary env mismatch: created in %d, accessed in %d", retary.env, info.Env());
        return retary;
    }
    NAPI_EXPORT_WRAPPED_PROPERTY(frbuf_t, "ports", ports_getter);
#endif //def USING_NAPI
//public: //ctor/dtor
//#ifdef USING_NAPI
//ctor with JS args:
//    Napi::Object port_napi[NUMPORTS];
//    Napi::Array ports_napi; //instantiate ports 1x, then return refs later (they'll be reused repeatedly)
//    frbuf_t(const Napi::CallbackInfo& info): ports_napi(ports_getter(info)) {}
//    {
//        ports_napi = ports_getter(info); //Napi::Array::New(info.Env(), NUMPORTS);
//        for (int i = 0; i < NUMPORTS; ++i)
//            frbuf_napi[i] = Napi::Object::New(info.Env());
//        return MyObject::NewInstance(info.Env(), info[0]);
//for cre JS obj within C, see https://github.com/nodejs/node-addon-examples/tree/master/8_passing_wrapped/node-addon-api
//            port_napi[i] = ExportedClass<port_t>::NewInstance(info.Env(), args);
//    }
//#endif //def USING_NAPI
//helpers:
#if 0 //def USING_NAPI //don't know how to use placement new (shm) with napi object wrapper :(
//wrap frbuf and return to JS:
//CAUTION: caller is assumed to be accessing frbuf way ahead of time so frbuf !locked (atomics help caller resolve)
    Napi::Value napi_wrap(Napi::Env env, size_t univlen, portnum_t portnum = -1)
    {
        if (!this) return env.Null(); //give valid result even if newer() returned 0
        Napi::Object retval = Napi::Object::New(env);
//            retval.defineProperty("seqnum", get_seqnum, set_seqnum); //Napi::Number::New(env, seqnum);
//https://github.com/nodejs/node-addon-api/blob/master/doc/property_descriptor.md
//            retval.defineProperty(PropertyDescriptor::Accessor<getTestGetter, TestSetter>("pd2");
//PropertyDescriptor pd1 = PropertyDescriptor::Accessor<TestGetter>("pd1");
//  PropertyDescriptor pd2 = PropertyDescriptor::Accessor<TestGetter, TestSetter>("pd2");
//            NAPI_ADD_OBJPROP(retval, "seqnum", get_seqnum, set_seqnum);
        retval.DefineProperty(seqnum_propdesc);
//            retval.set("timestamp", get_timestamp); //Napi::Number::New(env, timestamp);
//            NAPI_ADD_OBJPROP(retval, "timestamp", get_timestamp);
        retval.DefineProperty(timestamp_propdesc);
        auto arybuf = Napi::ArrayBuffer::New(env, &ports[0], sizeof(ports)); //includes padding
        const int W = univlen; //will be < UNIV_MAXLEN; depends on config
//            static_assert(sizeof(univ[0]) == (byte*)&univ[1] - (byte*)&univ[0]);
        if ((int)portnum == -1) //ret all univ (2D ary)
        {
//https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
            const int H = NUMPORTS;
            auto ary2D = Napi::Array::New(env, H);
            for (/*uint32_t*/ int y = 0; y < H; ++y)
            {
                Napi::Object port = Napi::Object::New(env);
//broken with limit, dirtyofs                    int len = y? W: sizeof(univ) / sizeof(wsnode_t); //(H - y) * W; //allow caller to use linear addresses on row[0] only; must incl gaps (padding)
                ports[y].napi_wrap(port, arybuf, y, W); //len);
                ary2D[y] = port; //CAUTION: RPi needs y to be uint32_t
            }
            retval.set("ports", ary2D);
        }
        else //ret request univ only (1D)
            ports[portnum].napi_wrap(retval, arybuf, portnum, W);
        return retval;
    }
#endif //def USING_NAPI
//    using frbuf_t = std::remove_cvref_t<decltype(frbuf[0])>;
    using seqnum_t = typename decltype(seqnum)::value_type;
    using timestamp_t = typename decltype(timestamp_msec)::value_type;
//    static constexpr int shmkey() { return SHMKEY; }
//    static constexpr size_t numbuf() { return NUMBUF; }
//    static constexpr size_t numports() { return NUMPORTS; }
//    static constexpr size_t univ_maxlen() { return UNIV_MAXLEN; }
    NAPI_STOP_EXPORTS(frbuf_t); //public
};
NAPI_EXPORT_CLASS(frbuf_t, "frbuf");
#if 0
//frbuf proxy objects:
//allow frbuf objects to be recycled (reused) without re-instantiating each time
//"placement new" (shm) likely !worky with napi wrapped objects anyway
{
    NAPI_START_EXPORTS(frbuf); //public
    /*struct*/ shmdata_t<> m_shdata; //data shared between all instances (across threads + procs)
public: //types
    using shmdata_t = typename decltype(m_shdata);
    using frbuf_t = typename decltype(m_shdata)::frbuf_t;
    using port_t = typename decltype(m_shdata)::port_t;
    using wsnode_t = typename decltype(m_shdata)::frbuf_t::wsnode_t;
//    frbuf_real_t m_fbptr;
//    int m_fbinx; //index into frbuf queue
//    int fbinx; //index into real frbuf (shm) queue
//    inline frbuf_t* fbptr() const { return m_shdata.fbptr(fbinx); }
//    frbuf_t* m_fbptr;
    frbuf_t& m_frbuf;
//    int portnum; //index into port props + nodes
//    inline port_t* pptr() const { return fbptr()->pptr(portnum); }
public: //ctor/dtor
    frbuf(int fbinx): m_frbuf(*m_shdata.fbptr(fbinx)) {} //frbuf_real_t* fbptr)
    ~frbuf() {}
public: //properties
//    inline GETTER(frtime_get, m_shdata.frtime_usec);
//    std::atomic<uint32_t> seqnum; //cycle#/song#; bump when rewinding timestamp
//    inline GETTER(seqnum); inline SETTER(seqnum); //shim
    NAPI_EXPORT_PROPERTY(frbuf, "seqnum", m_frbuf.seqnum);
//    std::atomic<elapsed_t> timestamp; //when to show this frame rel to seq start (msec); wraps @~1.2 hr
//    inline GETTER(timestamp); //shim
    NAPI_EXPORT_PROPERTY(frbuf, "timestamp", m_frbuf.timestamp);
//    std::atomic<int> limit;
//    inline GETTER(limit); inline SETTER(limit); //shim
    NAPI_EXPORT_PROPERTY(frbuf, "limit", fbptr()->ports[portnum % NUMPORTS].limit_get);
//            NAPI_PROPDESC(port_s ignored, limit_propdesc, limit, limit);
            std::atomic<size_t> first_dirty, last_dirty; //first + last dirty node ofs
            inline GETTER(first_dirty); inline SETTER(first_dirty); //shim
//            NAPI_PROPDESC(port_s ignored, first_dirty_propdesc, first_dirty, first_dirty);
            inline GETTER(last_dirty); inline SETTER(last_dirty); //shim
//            NAPI_PROPDESC(port_s ignroed, last_dirty_propdesc, last_dirty, last_dirty);
//            using dirty_t = decltype(dirty[0]);
            uint32_t wsnodes[UNIV_MAXLEN]; //start of WS node data
//            using wsnode_t = decltype(wsnodes[0]);
#if 0 //def USING_NAPI
            void napi_wrap(Napi::Object retval, Napi::ArrayBuffer arybuf, int portnum, int len)
            {
//            NAPI_ADD_OBJPROP(retval, "limit", get_limit, set_limit);
//                add_objprop_limit(retval);
                retval.DefineProperty(limit_propdesc);
//                    port.set("first_dirty", get_first_dirty, set_first_dirty);
//            NAPI_ADD_OBJPROP(retval, "first_dirty", get_first_dirty, set_first_dirty);
                retval.DefineProperty(first_dirty_propdesc);
//                    port.set("last_dirty", get_last_dirty, set_last_dirty);
//            NAPI_ADD_OBJPROP(retval, "last_dirty", get_last_dirty, set_last_dirty);
                retval.DefineProperty(last_dirty_propdesc);
                auto nodes = Napi::TypedArrayOf<wsnode_t>::New(env, len, arybuf, portnum * sizeof(ports[0]), napi_uint32_array); //https://github.com/nodejs/node-addon-api/blob/HEAD/doc/typed_array_of.md; //NOTE: wsnodes[] might be padded due to alignas()
                retval.set("wsnodes", nodes);
            }
#endif //def USING_NAPI
        } /*port_t; port_t*/ ports[NUMPORTS];
        using port_t = std::remove_cvref_t<decltype(ports[0])>;
        using portnum_t = int;
        using limit_t = decltype(ports[0].limit);
        using dirty_t = decltype(ports[0].first_dirty);
        using wsnode_t = std::remove_cvref_t<decltype(ports[0].wsnodes[0])>;
//helpers:
#if 0 //def USING_NAPI //don't know how to use placement new (shm) with napi object wrapper :(
//wrap frbuf and return to JS:
//CAUTION: caller is assumed to be accessing frbuf way ahead of time so frbuf !locked (atomics help caller resolve)
        Napi::Value napi_wrap(Napi::Env env, size_t univlen, portnum_t portnum = -1)
        {
            if (!this) return env.Null(); //give valid result even if newer() returned 0
            Napi::Object retval = Napi::Object::New(env);
//            retval.defineProperty("seqnum", get_seqnum, set_seqnum); //Napi::Number::New(env, seqnum);
//https://github.com/nodejs/node-addon-api/blob/master/doc/property_descriptor.md
//            retval.defineProperty(PropertyDescriptor::Accessor<getTestGetter, TestSetter>("pd2");
//PropertyDescriptor pd1 = PropertyDescriptor::Accessor<TestGetter>("pd1");
//  PropertyDescriptor pd2 = PropertyDescriptor::Accessor<TestGetter, TestSetter>("pd2");
//            NAPI_ADD_OBJPROP(retval, "seqnum", get_seqnum, set_seqnum);
            retval.DefineProperty(seqnum_propdesc);
//            retval.set("timestamp", get_timestamp); //Napi::Number::New(env, timestamp);
//            NAPI_ADD_OBJPROP(retval, "timestamp", get_timestamp);
            retval.DefineProperty(timestamp_propdesc);
            auto arybuf = Napi::ArrayBuffer::New(env, &ports[0], sizeof(ports)); //includes padding
            const int W = univlen; //will be < UNIV_MAXLEN; depends on config
//            static_assert(sizeof(univ[0]) == (byte*)&univ[1] - (byte*)&univ[0]);
            if ((int)portnum == -1) //ret all univ (2D ary)
            {
//https://github.com/nodejs/node-addon-api/blob/HEAD/doc/array_buffer.md
                const int H = NUMPORTS;
                auto ary2D = Napi::Array::New(env, H);
                for (/*uint32_t*/ int y = 0; y < H; ++y)
                {
                    Napi::Object port = Napi::Object::New(env);
//broken with limit, dirtyofs                    int len = y? W: sizeof(univ) / sizeof(wsnode_t); //(H - y) * W; //allow caller to use linear addresses on row[0] only; must incl gaps (padding)
                    ports[y].napi_wrap(port, arybuf, y, W); //len);
                    ary2D[y] = port; //CAUTION: RPi needs y to be uint32_t
                }
                retval.set("ports", ary2D);
            }
            else //ret request univ only (1D)
                ports[portnum].napi_wrap(retval, arybuf, portnum, W);
            return retval;
        }
#endif //def USING_NAPI
    } /*frbuf_t; frbuf_t*/ frbuf[NUMBUF];
    using frbuf_t = std::remove_cvref_t<decltype(frbuf[0])>;
    using seqnum_t = typename decltype(frbuf[0].seqnum)::value_type;
    using timestamp_t = typename decltype(frbuf[0].timestamp)::value_type;
    NAPI_STOP_EXPORTS(frbuf); //public
};
NAPI_EXPORT_CLASS(frbuf);
#endif //0


//shm sttr:
//holds config data + frbufs, anything that needs to be shared between threads/procs
//allows fast, efficient data sharing between JS threads and procs without IPC overhead
//JS renderers (providers) need to run well ahead of frbuf writer due to inprecise timing control in JS
//this allows atomics to be used instead of locks, which helps perf even more
//fps determines max univ len + frbuf size
//for simpler code, a min fps is set at compile time and then actual value used at run-time
//#define MIN_FPS  10 //support down to 10 fps (largest univ)
//#include <sys/mman.h> //mmap(), munmap()
#include <sys/ipc.h> //IPC_*
#include <sys/shm.h> //shmget(), shmat(), shmctl(), shmdt()
template<int NUMBUF = 4, int UNIV_MAXLEN = scrinfo_t::fps2nodes(MIN_FPS), int MIN_FPS = 10>
//struct shmdata: /*public*/ scrinfo_t //struct scrinfo
class shmdata_t: public scrinfo_t
{
public:
    using SUPER = scrinfo_t; //struct scrinfo;
//    CONSTDEF(NUMPORTS, 24); // /*static constexpr size_t*/ enum { NUMPORTS = 24 }; //#bits in RGB value; restricted by RPi h/w
    CONSTDEF(SHMKEY, 0x59414C4F); //one shared copy; use "YALP" in ASCII
//    uint32_t nodeofs; //manifest: stofs of node data
//    int fbnum; //fb device#; -1 = undecided
//    scrinfo timing; //GPU config for frdev
    int debug_level; //put this in here to allow select debug at global level
    std::atomic<int> bkgpid; //bkg process pid of FB update loop
    std::atomic<uint32_t> fifo; //first-used (oldest) frbuf; wraps to last-used (newest)
    struct
    {
        std::atomic<uint32_t> numfr; //#frames drawn
        std::atomic<uint32_t> busytime, idletime;
//        std::atomic<uint32_t> started[2]; //start time (sec + usec)
        std::atomic<timeval_t> started; //start time (sec + usec)
//add more stats as needed
//methods:
//        void clear() { numfr = busytime = idletime = 0; elapsed<(int)1e6>(started); } //started = latest_usec; }
    } stats;
//    using numfr_t = struct stats.numfr::value_type;
    using numfr_t = typename decltype(stats.numfr)::value_type;
//!needed; use getters/setters    using data_t = uint32_t; //use same data type for all port{} members so a typed array can be used
    frbuf_t frbuf[NUMBUF];
public: //ctor/dtor
//shm init to 0 when alloc; don't need ctor/dtor?
    shmdata_t(int fbnum, int want_debug = 0): shmdata_t(fbnum, NULL, want_debug) {}
    shmdata_t(int fbnum, const char* timing_ovr, int want_debug = 0): SUPER(fbnum, timing_ovr, want_debug), debug_level(want_debug) {}
//    {
//        if (numatt() != 1) return; //only initialize when shm seg is created
//        frdev = -1;
//        for (int i = 0; i < NUMBUF; ++i) oldest()->timestamp = -999e3; //
//    }
    ~shmdata_t() {}
//    {
//        if (numatt() == 1) bkgpid = 0;
//    }
//static_assert(sizeof(frbuf_t::seqnum_t) == 4);
public: //methods
//get oldest frbuf (head of queue):
    inline frbuf_t* fbptr(int n) const { return &frbuf[n % NUMBUF]; }
    inline frbuf_t* oldest() const { return fbptr(fifo); }
//static_assert(sizeof(frbuf_t::seqnum_t) == 4);
//find first frbuf !older than specified time for given seq#:
    frbuf_t* newer(seqnum_t want_seq, timestamp_t min_time) const
    {
        for (int svfifo = fifo, i = svfifo; i < svfifo + NUMBUF; ++i) //CAUTION: fifo could change during loop; use saved fifp head
        {
            frbuf_t* fbp = fbptr(i); //= &frbuf[i % NUMBUF];
            if (fbp->seqnum != want_seq) return fbp; //allow caller to detect stale seq# (no more bufs)
            if (fbp->timestamp >= min_time) return fbp; //first (oldest) match
        }
        return NULL; //all frbuf in use; caller needs to wait (polling for now); TODO: add IPC wakeup?
    }
//invalidate + recycle oldest or all frbufs:
//static_assert(sizeof(frbuf_t::seqnum_t) == 4);
    void recycle(seqnum_t seqnum = -1)
    {
        bool move_last = ((int)seqnum == -1); //frbuf[fifo % NUMBUF].seqnum == seqnum);
        if (!move_last) bkgpid = 0; //stop bkg upd loop
        for (int svfifo = fifo, i = svfifo; i < svfifo + NUMBUF; ++i) //bkg loop is only thread that will modify fifo head, but use saved copy just in case
        {
            frbuf_t* fbp = fbptr(i); //fbptr = &frbuf[i % NUMBUF];
            seqnum_t oldseq = fbp->seqnum;
            timestamp_t oldtime = fbp->timestamp;
            fbp->first_dirty = fbp->last_dirty = 0;
            if (move_last)
            {
//                int frnum = rdiv(fbptr->timestamp, timing.frtime() / 1e3);
//                fbptr->timestamp = (frnum + 4) * timing.frtime() / 1e3; //avoid cumulative drift;
                fbp->timestamp = frtime_msec(frnum(fbp->timestamp) + 4); //avoid cumulative drift by converting via fr#
debug("recycle[%d]: seq# %'u => %'u, timest %'u => %'u", i, oldseq, seqnum, oldtime, fbptr->timestamp);
                RETURN(++fifo); //fifo.compare_exchange_weak(svfifo, svfifo + 1, std::memory_order_relaxed, std::memory_order_relaxed)); //move frbuf from que head to tail; onlg bkg thread should do this, but use atomic update just in case
            }
            fbp->seqnum = seqnum;
            fbp->timestamp = frtime_msec(i - svfifo); //* frtime / 1e3; //msec; rewind to start next seq
debug("recycle[%d/%d]: seq# %'u => %'u, timest %'u => %'u", i, svfifo + NUMBUF, oldseq, seqnum, oldtime, fbptr->timestamp);
        }
    }
public: //static helpers
//place all instances in shm at same location:
    static void* operator new(size_t size) //, int shmkey = 0, SrcLine srcline = 0)
    {
        static_assert(size == sizeof(shmdata_t), strprintf("bad shmdata alloc size: %'u, expected %'u", size, sizeof(shmdata_t)));
        int shmid = ::shmget(SHMKEY, size /*+ sizeof(shmid)*/, 0666 | IPC_CREAT); //| IPC_EXCL: 0)); // | SHM_NORESERVE); //NOTE: clears to 0 upon creation
//        DEBUG_MSG(CYAN_MSG << "ShmSeg: cre shmget key " << FMT("0x%lx") << key << ", size " << size << " => " << FMT("id 0x%lx") << shmid << ENDCOLOR);
        if (shmid == -1) fatal(); //throw std::runtime_error(std::string(strerror(errno))); //failed to create or attach
        auto natt = numatt(shmid);
        CONSTDEF(DONT_CARE, NULL); //system chooses addr
        static constexpr int flags = 0; //read/write access
        shmdata_t* ptr = (shmdata_t*)::shmat(shmid, DONT_CARE, flags);
        debug("shm::new: key 0x%x, size %'u, id 0x%lx, ptr 0x%x, #att %d", SHMKEY, size, shmid, ptr, natt);
        if ((int)ptr == -1) fatal(); //throw std::runtime_error(std::string(strerror(errno)));
//        *ptr++ = shmid; //need id to get #nattach later
        if ((int)natt == 1) ptr->fbdev = -1; //FB device !chosen yet
        return ptr;
    }
    static void operator delete(void* ptr)
    {
  //      int shmid = *(int*)--ptr;
        int shmid = ::shmget(SHMKEY, 1, 0666); //use minimum size in case it changed
        if (shmid == -1) fatal(); //throw std::runtime_error(std::string(strerror(errno)));
        auto natt = numatt(shmid); //need to get shm info before dettach?
        if (::shmctl(shmid, IPC_RMID, NULL /*ignored*/)) fatal(); //throw std::runtime_error(strerror(errno)); //won't be deleted until last process dettaches
        if ((int)::shmdt(ptr) == -1) fatal(); //throw std::runtime_error(strerror(errno));
//        ptr = 0; //can't use m_shmptr after this point
        debug("shm::delete: id %d, ptr 0x%x, #att %d", shmid, ptr, natt);
    }
    using shmid_ds_t = struct shmid_ds;
    using nattch_t = decltype(/*struct*/ shmid_ds_t::shm_nattch);
    static nattch_t numatt(int shmid)
    {
        struct shmid_ds shminfo;
        if ((int)::shmctl(shmid, IPC_STAT, &shminfo) == -1) fatal(); //throw std::runtime_error(strerror(errno));
        return shminfo.shm_nattch;
    }
};
//template<int NUMBUF = 4, int UNIV_MAXLEN = scrinfo::fps2nodes(MIN_FPS)>
//using shmdata_t = struct shmdata<>; //NUMBUF, UNIV_MAXLEN>;


#elif _HOIST == HOIST_HELPERS
 #undef _HOIST
#define _HOIST  HOIST_UTILS
#include __FILE__  //error here requires CD into folder or add "-I." to compile
///////////////////////////////////////////////////////////////////////////////
////
/// higher level defs + helpers (will be hoisted above main()
//


//export C++ classes/objects to Javascript (non-intrusive):
#ifdef NODE_GYP_MODULE_NAME //defined by node-gyp
 #include "napi-helpers.h"
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


//define getter/setter wrappers:
//can be used as napi shims
#define GETTER(...)  UPTO_2ARGS(__VA_ARGS__, GETTER_2ARGS, GETTER_1ARG) (__VA_ARGS__)
#define GETTER_1ARG(name)  GETTER_2ARGS(get_ ## name, name)
#define GETTER_2ARGS(name, target)  decltype(target) name() const { return target; }

#define SETTER(...)  UPTO_2ARGS(__VA_ARGS__, SETTER_2ARGS, SETTER_1ARG) (__VA_ARGS__)
#define SETTER_1ARG(name)  SETTER_2ARGS(set_ ## name, name)
#define SETTER_2ARGS(name, target)  void name(decltype(target) newval) { target = newval; }

#define SETTERCB(name, cb)  void name(decltype(name()) newval) { cb(newval); }

//getter/setter for atomic members:
//napi doesn't like atomics
#define AGETTER(...)  UPTO_2ARGS(__VA_ARGS__, AGETTER_2ARGS, AGETTER_1ARG) (__VA_ARGS__)
#define AGETTER_1ARG(name)  AGETTER_2ARGS(aget_ ## name, name)
#define AGETTER_2ARGS(name, target)  decltype(target.load()) name() const { return target; }

#define ASETTER(...)  UPTO_2ARGS(__VA_ARGS__, SETTER_2ARGS, SETTER_1ARG) (__VA_ARGS__)
#define ASETTER_1ARG(name)  ASETTER_2ARGS(aset_ ## name, name)
#define ASETTER_2ARGS(name, target)  void name(decltype(target.load()) newval) { target = newval; }

//#define ASETTERCB(name, target, cb)  void name(decltype(target.load()) newval) { cb(newval); }


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
int open(void) { return -1; } //kludge: can't overload templated member function in AutoFile, so overload open() instead
class AutoFile
{
    int m_fd;
public: //ctor/dtor
//    AutoClose(const char* name): AutoClose(
//    AutoFile(int fbnum): AutoClose(fbname(fbnum), O_RDWR) {}
    template <typename ... ARGS>
    AutoFile(ARGS&& ... args): AutoFile(::open(std::forward<ARGS>(args) ...)) {}; //perfect fwd args to open()
    template<int> AutoFile(int fd): m_fd(fd) {};
//    template<> AutoFile(): m_fd(-1) {}
    ~AutoFile()
    {
        if (isOpen() && ::close(m_fd) < 0) fatal(); //std::runtime_error(strerror(errno));
        m_fd = -1;
    }
public: //operators
    operator int() const { return m_fd; }
public: //methods
    inline bool isOpen() const { return (m_fd >= 0); } //::isOpen(m_fd); }
};


//FB wrapper:
//auto-closes FB upon scope exit
#include <fcntl.h> //O_RDWR
//#include <sys/stat.h> //open()?
//#include <sys/types.h> //open()?
//#include <utility> //std::forward<>()
#include <sys/mman.h> //mmap(), munmap(), PROT_*, MAP_*
#include <linux/fb.h> //FBIO_*, struct fb_var_screeninfo, fb_fix_screeninfo
template <typename DATA_T = uint32_t>
class AutoFB: public AutoFile
{
    using SUPER = AutoFile;
    DATA_T* m_pxbuf = MAP_FAILED;
    size_t m_rowlen32 = 0, m_height = 0;
    inline size_t numpx() const { return m_rowlen32 * m_height; }
public: //ctor/dtor
//    template <typename ... ARGS>
//    AutoFB(ARGS&& ... args): SUPER(std::forward<ARGS>(args) ...), m_pxbuf(MAP_FAILED), m_rowlen32(0), m_height(0) //perfect fwd args to open()
    AutoFB(int fbnum): SUPER(fbname(fbnum), O_RDWR) //, m_pxbuf(MAP_FAILED), m_rowlen32(0), m_height(0)
    {
        if (!isOpen()) fatal();
        struct fb_fix_screeninfo scrf;
        if (ioctl(*this, FBIOGET_FSCREENINFO, &scrf) < 0) fatal(); //throw std::runtime_error(strerror(errno));
        m_rowlen32 = scrf.line_length / sizeof(DATA_T); //NOTE: might be larger than screen hres due to padding
        if (scrf.line_length % sizeof(DATA_T)) fatal("FB %d row len %'d !multiple of px data type %d; row+gap addressing broken", fbnum, scrf.line_length, sizeof(DATA_T));
        m_height = scrf.smem_len / m_rowlen32;
        if (scrf.smem_len % scrf.line_length) warn("FB %d memlen %'d !multiple of row len %'d", fbnum, scrf.smem_len, scrf.line_length);
        m_pxbuf = (DATA_T*)::mmap(*this, (void*)0, numpx() * sizeof(DATA_T), PROT_READ | PROT_WRITE, MAP_SHARED, (int)*this, 0); //shared with GPU
        if (m_pxbuf == (DATA_T*)MAP_FAILED) fatal(); //throw std::runtime_error(strerror(errno));
//        if (m_rowlen32 != scrv.xres) warn("raster rowlen32 %'lu != width %'d", m_rowlen32, scrv.xres);
//        if (new_height * new_rowlen32 * 4 != scrf.smem_len) debug(YELLOW_MSG "CAUTION: raster size %'lu != calc %'d", new_height * new_rowlen32 * 4, scrf.smem_len);
    }
    ~AutoFB()
    {
        if (m_pxbuf != MAP_FAILED && ::munmap(*this, m_pxbuf, numpx() * sizeof(DATA_T)) < 0) fatal(); //throw std::runtime_error(strerror(errno));
        m_pxbuf = MAP_FAILED;
    }
public: //helpers
    static const char* fbname(int fbnum) { return strprintf("/dev/fb%d", fbnum); } //FB device name
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
        return *(const PxRow*)&m_pxbuf[inx * m_rowlen32]; //kludge: cast a memberless row proxy on top of px buf at requested row address
    }
public: //properties
//    DATA_T* pixels() const { return m_pxbuf; }
    inline size_t width() const { return m_rowlen32; }
    inline size_t height() const { return m_height; }
};


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
    if (!pipe) fatal(); //throw std::runtime_error("popen() failed!");
    char buffer[250];
//    while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr) result += buffer.data();
    while (fgets(buffer, sizeof(buffer), pipe.get()) != nullptr) result += buffer;
    std::string& result_esc = str_replace(result.c_str(), "\n", CYAN_MSG "\\n" ENDCOLOR_NOLINE); //esc special chars in debug output
debug("shell '%s' output %'lu:'%s'", cmd, result.length(), result_esc.c_str());
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


//divide up:
#define divup(num, den)  (((num) + (den) - 1) / (den))
//rounded divide:
#define rdiv(num, den)  (((num) + (den) / 2) / (den))
//make value a multiple of another:
//#define multiple(num, den)  ((num) - (num) % (den))

//left/right shift:
#define shiftlr(val, pos)  (((pos) < 0)? ((val) << -(pos)): ((val) >> (pos)))

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


CONSTDEF(CACHELEN, 64); // /*static constexpr size_t*/ enum { CACHELEN = 64 }; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both


#include <clocale> //setlocale()
const char* THISLINE(dummy) = setlocale(LC_ALL, ""); //enable %'d commas in printf


//turn null ptr into empty/default str:
inline const char* ifnull(const char* str, const char* null = 0)
{
    return (str && str[0])? str: (null && null[0])? null: "";
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
    if (len >= sizeof(buf[0])) snprintf(bufp + sizeof(buf[0]) - RESV_LEN, RESV_LEN, " (+%'d) ...", len - sizeof(buf[0]) - RESV_LEN); //show continuation indicator + amount trimmed
    return bufp;
}


//str replace:
//caller can call retval.c_str() to get const char* result
#include <string> //std::string
#include <string.h> //strlen()
std::string& str_replace(const char* str, const char* from, const char* to = 0)
{
    static std::string result; //static return from function avoids copy ctor in caller
    result = str;
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


//misc message functions:
#include <stdio.h> //printf()
//#include <cstdio> //printf()
#include <stdexcept> //std::runtime_error()
#include <string.h> //strerror()
#include <errno.h> //errno
static int prevout = 1; //true; //don't need to start with newline
#define SRCLINE  "@" __FILE__ ":" TOSTR(__LINE__)
#pragma message("add mutex to prevent msg interleave")
//#define warn(...)  (log(YELLOW_MSG __VA_ARGS__), 0)
#define warn(...)  debug(YELLOW_MSG "WARNING: " __VA_ARGS__)
#define error(...)  debug(PINK_MSG "ERROR: " __VA_ARGS__)
#define fatal()  throw std::runtime_error(std::string(strerror(errno)));
#define fatal(...)  throw std::runtime_error(strprintf(RED_MSG "FATAL: " __VA_ARGS__))
#define debug(...)  debug_where(BLUE_MSG __VA_ARGS__, rti()) //NOTE: adds run-time info *and* ensures >= 2 args so first one can be split off
#define debug_where(fmt, ...)  prevout = printf("\n" fmt " %s" SRCLINE ENDCOLOR_NEWLINE + (prevout > 0), __VA_ARGS__, rti())
//TODO: fix color spread
//#define debug_1ARG(msg)  prevout = printf("\n" BLUE_MSG "%s" msg ENDCOLOR_ATLINE_INFO + (prevout > 0), DebugScope::top(": "), rti())
//#define debug_MORE_ARGS(msg, ...)  prevout = printf("\n" BLUE_MSG "%s" msg ENDCOLOR_ATLINE_INFO + (prevout > 0), DebugScope::top(": "), __VA_ARGS__, rti())
#define rti()  strprintf("$%d T+%4.3f", thrinx(), (double)elapsed<(int)1e3>() / 1e3) //(now_msec() - started) / 1e3)
//const char* rti()
//{
//    static char buf[100];
//    snprintf(buf, sizeof(buf), " $%d T+%4.3f", thrinx(), (now_msec() - started) / 1e3);
//    return buf;
//}


//check if file open:
//inline bool isOpen(int fd)
//{
//    return (fd > 0); //fd && (fd != -1));
//}


//check for file existence:
#include <sys/stat.h> //struct stat
inline bool fexists(const char* path)
{
    struct stat info;
    return !stat(path, &info); //file exists
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
int thrinx(/*const thrid_t&*/ /*std::thread::id*/ /*auto*/ thrid_t myid = thrid()); //need fwd ref to allow circular deps


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
#include <sys/time.h> //struct timeval, struct timezone
#include <time.h> //struct timespec
//inline void get_now(struct timeval& now)
//{
//    struct timezone& tz = *NULL_OF(struct timezone); //relative times don't need this
//    if (gettimeofday(&now, &tz)) fatal(); //throw std::runtime_error(std::string(strerror(errno))); 
//    return 0; //kludge: dummy return to allow inline call at global scope
//}
//struct timeval epoch = 0; //= now; //set epoch first time called
//int dummy = 
//using msec_t = unsigned int;
//struct timeval now_latest; //allow caller to see raw time if desired
//static constexpr uint32_t MAXUINT32 = -1, MAX_ELAPSED = MAXUINT32 / 1e6;
using elapsed_t = uint32_t; //unsigned int;
using timeval_t = struct timeval;
template <unsigned int UNITS = (int)1e3> //default msec
elapsed_t elapsed(timeval_t& started = *NULL_OF(timeval_t))
{
//    struct timeval now;
    timeval_t now;
    static struct timezone& tz = *NULL_OF(struct timezone); //relative times don't need this
    if (gettimeofday(&now, &tz)) fatal(); //throw std::runtime_error(std::string(strerror(errno))); //fatal("gettimeofday"); // 0x%p", &tz);
//    get_now(&now);
//    static bool init = epoch = now;
//    return now_msec(&timeval);
//    static decltype(timeval.tv_sec) started = timeval.tv_sec; //- 1; //set epoch first time called; ignore usec (might cause ovfl prior to substraction)
    static timeval_t epoch = now; //set epoch first time called
    timeval_t& since = &started? started: epoch; //compare to caller vs. global epoch
    if (&started) started = now; //give caller new start time
//    /*long int*/ usec_t usec = now_latest = (now.tv_sec - started.tv_sec) * 1e6 + now.tv_usec - started.tv_usec; //NOTE: arm clamps to -1!
    CONSTDEF(MAX_SEC, (int)((elapsed_t)-1 / UNITS)); //max value before wrap
static int first = 0;
if (!first++) printf("max sec for units %'d = %'d\n", UNITS, MAX_SEC);
    int diff_sec = now.tv_sec - since.tv_sec;
//CAUTION: need to check for overflow *before* multiply (arm clamps to uint32 max):
    if (diff_sec < 0 || diff_sec >= MAX_SEC) fatal("%'dsec wrap @T+%'d sec; limit was %'u sec", UNITS, diff_sec, MAX_SEC);
    return diff_sec * UNITS + (now.tv_usec - since.tv_usec) / ((int)1e6 / UNITS);
}
//template <int UNITS = (int)1e3> //default msec
//elapsed_t elapsed() { return elapsed<>(*NULL_OF(timeval_t)); } //kludge: overload can't be merged with template
//template <int UNITS = 1e3> //default msec
//elapsed_t elapsed() { return elapsed<UNITS>(NULL_OF(timeval_t)); }
//msec_t elapsed_msec()
//{
//    static int err = gettimeofday(&now, &tz);
//    return elapsed_msec(started);
//}
//msec_t started = 
int THISLINE(dummy) = elapsed<>(); //set start time (global epoch)
//using msec_t = decltype(elapsed<1e3>()//using msec_t = unsigned int;
//using msec_t = unsigned int;
//template <typename ... ARGS>
//inline elapsed_t elapsed_msec(ARGS&& ... args)
//{
//    return elapsed<1e3>(std::forward<ARGS>(args) ...); //less accurate, longer range (~50 days)
//}
//template <typename ... ARGS>
//inline elapsed_t elapsed_usec(ARGS&& ... args)
//{
//    return elapsed<1e6>(std::forward<ARGS>(args) ...); //more accurate, shorter range (~1.2hr)
//}


#if 0
//for more accurate timing:
//CAUTION: assumes single thread; now_latest could be overwritten if other threads call now_msec()
using usec_t = unsigned int;
usec_t elapsed_usec(struct timeval& started = epoch)
{
//    struct timeval started = now_latest; //save previous
    struct timeval now;
//    now_msec(now);
//    struct timezone& tz = *NULL_OF(struct timezone); //relative times don't need this
//    if (gettimeofday(&now, &tz)) fatal(); //throw std::runtime_error(std::string(strerror(errno))); 
    get_now(&now);
    enum { MAX_USEC = (int)((usec_t)-1 / 1e6) }; //max value before usec will wrap
static int first = 0;
if (!first++) printf("max usec %d\n", MAX_USEC);
    int diff_sec = now.tv_sec - started.tv_sec;
//CAUTION: need to check for overflow *before* multiply (arm clamps to uint32 max):
    if (diff_sec < 0 || diff_sec >= MAX_USEC) fatal("usec wrap @T+%'d sec; limit %'u sec", diff_sec, MAX_USEC);
    return diff_sec * 1e6 + now.tv_usec - started.tv_usec; //CAUTION: arm clamps to uint32max @~1.2 hr
}
//usec_t elapsed_usec()
//{
//    static int err = gettimeofday(&now, &tz);
//    return elapsed_usec(started);
//}
//#pragma message(RED_MSG "debug elapsed lockup");
#endif


//moved here to resolve circular deps:
int thrinx(/*const thrid_t&*/ /*std::thread::id*/ /*auto*/ thrid_t myid) // = thrid())
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
    debug("new thread[%d] 0x%lx, pid %d, thrinx %d", retval, myid, getpid()); //CAUTION: recursion into above section
    return retval;
}
//int thrinx() { return thrinx(thrid()); }


//#elif _HOIST == HOIST_OTHER
// #undef _HOIST
//#define _HOIST  HOIST_WHATEVER
//#include __FILE__  //error here requires CD into folder or add "-I." to compile
#endif //def _HOIST
//eof