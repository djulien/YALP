//RenXt_tool
//test tool for RenXt
//history:
// 1.0  10/4/13  DJ  created


//#ifdef __STRICT_ANSI__
//// #pragma message WARN("turning off STRICT_ANSI to pull in strcasecmp")
// #undef __STRICT_ANSI__
//#endif // __STRICT_ANSI__
//#ifdef _NO_OLDNAMES
// #undef _NO_OLDNAMES
//#endif // _NO_OLDNAMES

#include "myregex.h"

#include <iostream>
//#include <fstream>
#include <queue> //priority_queue
#include <deque>
#include <limits>

#ifdef _MSC_VER
 #include <hash_map>
 #define hash_map  unordered_map //c++ 2011 compat
#else
 #include <unordered_map>
#endif
//#include <unordered_set>


//#include <iostream>
#include <stdio.h>
#include <stdarg.h>
#include <ctype.h>
//#include <exception>
#include <string.h> //NOTE: this conflicts with Boost, so only do it after including Boost
//int __cdecl __MINGW_NOTHROW strcasecmp (const char*, const char *);

//NOTE: this conflicts with Boost, so only do it after including Boost
#define WANT_API  1 //data defs only, no API
#define WANT_STRICMP
#define WANT_DEBUG 100
//#define DLL_EXPORT __declspec(dllexport)
//#define DLL_EXPORT __declspec(dllimport)
#include "platform.h"
#include "RenXt.h" //put this first so we can use WARN pragma below


//#ifdef _MSC_VER
// #include "stdafx.h"
// #define TR1  std::tr1
//#else //_MSC_VER
// #define wchar_t  char
// #define wcstombs_s(convlen, destbuf, destsize, srcbuf, srcsize)  strncpy(destbuf, srcbuf, destsize)
// #include <stdlib.h>
// #define vsprintf_s(buf, buflen, fmt, argp)  vsprintf(buf, fmt, argp)
// #define TR1  std
// #define _TCHAR  const char
// #define _tmain  main
//#endif //_MSC_VER


//NOTE: conflict with Boost:
//#define WANT_API  1 //get API definitions
//#include "RenXt.h" //pull in API definitions (API uses byte, uint16_t from above)


//using namespace std;
#define MY_VERSION  1

#define numents(ary)  (sizeof(ary)/sizeof(ary[0]))
#define rdiv(num, den)  (((num) + (den)/2) / MAX(den, 1))
#define divup(num, den)  (((num) + (den) - 1) / MAX(den, 1)) //ceil((num)/MAX(den, 1))


void sprintf_back(std::vector<std::string>& strlist, const char* fmt, ...)
{
    strlist.push_back("");
    std::string& str = strlist.back();
    va_list argp;
    va_start(argp, fmt);
    str.resize(255);
    str.resize(vsprintf(&str[0], /*255,*/ fmt, argp));
    va_end(argp);
}


//get one or more byte values from input string:
template<typename T>
size_t get_values(std::string& buf, std::vector<T>& values)
{
    static myRegEx values_pattern("^\\s*(0x[0-9A-F]+|[0-9]+)\\s*", wxRE_ICASE);
	size_t svlen = values.size();
//	boost::smatch parts;

    for (;;)
    {
//        printf("search '%s' = %d\n", bytestr.c_str(), boost::regex_search(bytestr, parts, bytes_pattern));
        if (!values_pattern.Matches(buf)) break;
        std::string valstr = values_pattern.GetMatch(1);
        int radix = ((valstr.size() > 1) && (toupper(valstr[1]) == 'X'))? 16: 10;
        if (radix == 16) valstr.erase(0, 2);
        int val = 0;
        while (!valstr.empty())
        {
            val *= radix;
            val += isdigit(valstr.front())? valstr.front() - '0': toupper(valstr.front()) - 'A' + 10;
            valstr.erase(0, 1);
        }
        if (val & ~std::numeric_limits<T>::max()) printf("ignoring bad value: '%s'\n", (const char*)values_pattern.GetMatch(1).c_str());
        else values.push_back(val);
        buf.erase(0, values_pattern.GetMatch(0).size()); //consume recognized part of inbuf AFTER parsing
    }
//    printf("get_bytes size was %d is now %d, first = %d\n", svlen, bytes.size(), bytes.size()? bytes[0]: -1);
    return values.size() - svlen; //#bytes found
}

//alternate version to get just one byte:
//assumes at least one byte value, ignores others
byte get_byte(std::string bytestr)
{
    std::vector<byte> bytes;
    return get_values<byte>(bytestr, bytes)? bytes[0]: 0;
}

uint16_t get_uint16(std::string str)
{
    std::vector<uint16_t> vals;
    return get_values<uint16_t>(str, vals)? vals[0]: 0;
}

//kludge to access protected members:
#if 0
class CommandHandler; //fwd ref
//enum CommandHandler::Result; //fwd ref
//template <typename T>
//class MyVector: public std::vector<T>
//{
//friend class Palette;
//};
#if 1
template <typename T>
class MyQueue: public std::priority_queue<T*> //, std::vector<T>, T>
{
friend class CommandHandler;
//CommandHandler::Result help(std::string& cmdbuf);
private:
    std::vector<T> entries;
public:
    void push(const T& that)
    {
        printf("push %s\n", that.desc().substr(0,8).c_str());
        entries.push_back(that);
        std::priority_queue<T*>::push(&entries.back());
    }
    T* begin(void)
    {
//        MyQueue<T> qcopy;
        return &entries.front();
    }
    T* end(void)
    {
        return &entries.back();
    }
};
#else
template <typename T>
class MyQueue: public std::priority_queue<int> //T, std::vector<T>, T>
{
//friend class CommandHandler;
//CommandHandler::Result help(std::string& cmdbuf);
private:
    std::vector<T> c2;
public:
    void push(T& that)
    {
        std::string strkey = that.desc();
        int intkey = (strkey[0] << 24) + (strkey[1] << 16) + (strkey[2] << 8) + cc.size();
        std::priority_queue<int>::push(intkey);
        cc.push(that);
    }
    T* begin(void)
    {

    }
    T* end(void)
    {

    }
};
#endif
#endif

//command handler base class:
class CommandHandler
{
public:
    enum Result { Invalid = -1, None = 0, Okay = 1, Exit = 2};
friend Result help(std::string& cmdbuf); //help;
//    static std::string debug_log;
private:
//    boost::regex parse;
//    std::string summary; //, desc;
    static std::vector<CommandHandler> all; //MyQueue<CommandHandler> all;
    typedef Result HandlerFunc(/*CommandHandler* me,*/ std::string& cmdbuf);
    HandlerFunc* cmdh;
//    static std::string GetSummary, GetDesc;
public: //ctor
//    Command(const char* summary, const char* desc, const char* pattern): summary(summary), desc(desc), parse(pattern, boost::regex::icase)
    CommandHandler(HandlerFunc* func = 0): cmdh(func)
    {
//        std::string cmd = Help;
//        func(cmd);
//        printf("cre(%s..)\n", cmd.substr(0,8).c_str());
//        if (func(cmd) == Okay) { CommandHandler::debug_log += "all.push("; debug_log += cmd; debug_log += ")\n"; }
        all.push_back(*this); //remember all commands (sorted)
    }
public: //sorting helpers (required by priority_queue)
    inline bool operator() (const CommandHandler& lhs, const CommandHandler& rhs) const { return lhs.desc() < rhs.desc(); }
    inline bool operator() (CommandHandler* lhs, CommandHandler* rhs) const { return operator()(*lhs, *rhs); }
//    inline bool operator() (const CommandHandler& lhs, const CommandHandler& rhs) const
//    {
//        std::string ldesc = lhs.desc(), rdesc = rhs.desc();
//        printf("%s.. < %s.. ? %d\n", ldesc.substr(0,8).c_str(), rdesc.substr(0,8).c_str(), ldesc < rdesc);
//        return lhs.desc() < rhs.desc();
//    }
public: //custom members
    inline Result exec(std::string& cmdbuf) const { return cmdh(cmdbuf); }
    static Result exec_all(std::string& cmdbuf)
    {
        Result ret = None;
        for (auto cmdptr = all.begin(); (ret == None) && (cmdptr != all.end()); ++cmdptr)
            ret = cmdptr->exec(cmdbuf);
        return ret;
    }
    static std::string Help;
    static void show_cmds(void)
    {
        for (auto cmdptr = all.begin(); cmdptr != all.end(); ++cmdptr)
        {
            std::string cmd = Help;
            if (cmdptr->exec(cmd) == Okay) printf("  %s\n", cmd.c_str());
        }
    }
//    static void debug(void)
//    {
//        if (!debug_log.empty()) printf(debug_log.c_str());
//        debug_log.erase(0);
//    }
private: //helpers
    std::string desc(void) const
    {
        static myRegEx sqbr("[\\[\\]]");
        static std::string nostring;
        std::string cmd = Help;

        exec(cmd);
        wxString from = cmd, to = wxEmptyString;
        cmd = sqbr.ReplaceAll(from, to); //clean up command desc before sorting it
//        printf("desc(%s)\n", cmd.c_str());
        return cmd;
    }
};
/*MyQueue*/ std::vector<CommandHandler> CommandHandler::all;
std::string CommandHandler::Help = "help!"; //, CommandHandler::debug_log;


#define varmsg(msgtype, where, stream, fmt)  \
{ \
}


//display msg and return invalid:
CommandHandler::Result invalid(const char* fmt, ...)
{
    va_list argp;
    va_start(argp, fmt);
    vfprintf(stdout, fmt, argp);
    va_end(argp);
    return CommandHandler::Result::Invalid;
}


//commonly used regex fragments:
//enclosed within () to capture actual value
//also allows leading white space
#define WHSP_REGEX(reqd)  WHSP_##reqd##_REGEX
#define WHSP_0_REGEX  "\\s*" //\\s+? doesn't work, so need to use this instead
#define WHSP_1_REGEX  "\\s+"
#define PORT_REGEX  "(" WHSP_REGEX(1) "([A-Z0-9_$:]+))"
#define BAUD_REGEX  "(" WHSP_REGEX(1) "([0-9]+k?))"
#define CONFIG_REGEX "(" WHSP_REGEX(1) "([5-8],?[NOEMS],?(1|1.5|2)))"
#define HEXNUM_REGEX  "(" WHSP_REGEX(1) "([0-9]+|0x[0-9A-F]+))"
#define INTNUM_REGEX  "(" WHSP_REGEX(0) "(-?[0-9]+|-?0x[0-9A-F]+))"
#define STRING_REGEX  "(" WHSP_REGEX(1) "([^ ]+|\"[^\"]]+\"))"
#define JUNK_REGEX  "(" WHSP_REGEX(1) "(.*))"


bool dedup = true;

//set config options:
CommandHandler::Result config_opts(std::string& cmdbuf)
{
#if 0
    const int level_inx = 4+1, junk_inx = 6+1;
    boost::regex debug_cmd("^" WHSP_REGEX(0) "d(e(b(ug?)?)?)?" HEXNUM_REGEX "?" JUNK_REGEX "?" WHSP_REGEX(0) "$", boost::regex::icase);
	boost::smatch parts;

    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "d[ebug] <level> = set debug level: 0 for off, higher values for more detail";
        return CommandHandler::Result::Okay;
    }
    if (!boost::regex_search(cmdbuf, parts, debug_cmd)) return CommandHandler::Result::None; //not for me
    if (!parts[junk_inx].str().empty()) return invalid("junk found: '%s'\n", parts[junk_inx].str().c_str());
    RenXt_debug_level = get_byte(parts[level_inx].str());
    printf("debug level set to %d\n", RenXt_debug_level);
#else
    const int value_inx = 6+1, junk_inx = 8+1;
    myRegEx config_cmd("^" WHSP_REGEX(0) "((debug_file)|(debug_level)|(palovfl)|(dedup))\\s*=" INTNUM_REGEX "?" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//    printf("regex: %s\n", "^" WHSP_REGEX(0) "((debug_file)|(debug_level)|(palovfl)|(dedup))\\s*=" INTNUM_REGEX "?" JUNK_REGEX "?" WHSP_REGEX(0) "$");
//    printf("vs. str '%s' match? %d\n", (const char*)cmdbuf.c_str(), config_cmd.Matches(cmdbuf));
//	boost::smatch parts;

    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "<var> \"=\" <value> = set config variable (debug_file, debug_level, palovfl, dedup)";
        return CommandHandler::Result::Okay;
    }
    if (!config_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    if (!config_cmd.GetMatch(junk_inx).empty()) return invalid("Config junk found: '%s'\n", (const char*)config_cmd.GetMatch(junk_inx).c_str());
    std::string valstr = config_cmd.GetMatch(value_inx);
//    valstr = config_cmd.GetMatch(0);
//    valstr = config_cmd.GetMatch(1);
//    valstr = config_cmd.GetMatch(2);
//    valstr = config_cmd.GetMatch(3);
//    valstr = config_cmd.GetMatch(4);
//    valstr = config_cmd.GetMatch(5);
//    valstr = config_cmd.GetMatch(6);
//    valstr = config_cmd.GetMatch(7);
//    valstr = config_cmd.GetMatch(8);
//    valstr = config_cmd.GetMatch(9);
    int sgn = 1, valnum = 0; //get_byte(parts[value_inx].str());
    for (; !valstr.empty(); valstr.erase(0, 1))
        if (isdigit(valstr.front())) valnum = 10 * valnum + valstr.front() - '0';
//        else if (toupper(baudstr.front()) == 'K') baud_rate *= 1000;
        else if (valstr.front() == '-') sgn = -1; // must save until end
        else { valstr = invalid("invalid value: '%s'\n", (const char*)config_cmd.GetMatch(value_inx).c_str()); break; }
    valnum *= sgn;
    for (;;) //dummy loop for easier flow control
    {
        if (!config_cmd.GetMatch(2).empty()) RenXt_debug_file = config_cmd.GetMatch(value_inx);
        else if (!valstr.empty()) { printf("%s\n", valstr.c_str()); break; } //fence: numeric-only values below
        else if (!config_cmd.GetMatch(3).empty()) RenXt_debug_level = valnum; //get_byte(parts[value_inx].str());
        else if (!config_cmd.GetMatch(4).empty()) RenXt_palovfl = valnum; //get_byte(parts[value_inx].str());
        else if (!config_cmd.GetMatch(5).empty()) dedup = (valnum != 0); //get_byte(parts[value_inx].str());
        else { printf("unrecognized: %s\n", config_cmd.GetMatch(1).c_str()); break; }
        printf("%s set to %s (%d)\n", (const char*)config_cmd.GetMatch(1).c_str(), (const char*)config_cmd.GetMatch(value_inx).c_str(), valnum);
        break;
    }
#endif
    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Okay;
}
CommandHandler config_cmd(config_opts);


//open a port:
CommandHandler::Result open_port(std::string& cmdbuf)
{
    const int port_inx = 3+1, baud_inx = 5+1, bits_inx = 7+1, fps_inx = 9+1, pad_inx = 11+1, junk_inx = 13+1;
//    boost::regex open_cmd("^\\s*o(p(en?)?)?(\\s+([A-Z0-9_$:]))?(\\s+([0-9]+k?))?(\\s+([5-8],?[NOEMS],?[0-2]))?(\\s+(.*))?\\s*$", boost::regex::icase);
    myRegEx open_cmd("^" WHSP_REGEX(0) "o(p(en?)?)?" PORT_REGEX "?" BAUD_REGEX "?" CONFIG_REGEX "?" HEXNUM_REGEX "?" HEXNUM_REGEX "?" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//	boost::smatch parts;

//    if (boost::regex_search(inbuf, parts, CommandHandler::help_cmd))
    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "o[pen] <port> [<baud> [<data,parity,stop> [fps [pad freq]]]] = open a port"; //to send data";
        return CommandHandler::Result::Okay;
    }
    if (!open_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    if (!open_cmd.GetMatch(junk_inx).empty()) return invalid("Open junk found: '%s'\n", (const char*)open_cmd.GetMatch(junk_inx).c_str());
    std::string/*&*/ port = open_cmd.GetMatch(port_inx);
//    while (!port.empty() && isspace(port.front()) port.pop_front();
    if (port.empty()) return invalid("missing port\n");
    int baud_rate = 0;
    if (open_cmd.GetMatch(baud_inx).empty()) baud_rate = 242500; //250000; //115200; //choose a baud rate that is friendly towards 5 MIPS and 8 MIPS PICs
    else
        for (std::string baudstr = open_cmd.GetMatch(baud_inx); !baudstr.empty(); baudstr.erase(0, 1))
            if (isdigit(baudstr.front())) baud_rate = 10 * baud_rate + baudstr.front() - '0';
            else if (toupper(baudstr.front()) == 'K') baud_rate *= 1000;
            else return invalid("invalid baud rate: '%s'\n", (const char*)open_cmd.GetMatch(baud_inx).c_str());
    std::string/*&*/ bits = !open_cmd.GetMatch(bits_inx).empty()? open_cmd.GetMatch(bits_inx): "8N2"; //8N1.5";
    for (size_t ofs; (ofs = bits.find(",")) != std::string::npos; bits.erase(ofs, 1)); //remove optional "," separators
    int fps = !open_cmd.GetMatch(fps_inx).empty()? get_byte(open_cmd.GetMatch(fps_inx)): 20; //default 20 fps (50 msec)
    int pad = !open_cmd.GetMatch(pad_inx).empty()? get_uint16(open_cmd.GetMatch(pad_inx)): !stricmp(bits.c_str(), "8N1")? 200: 0; //default .5% for 8N1
    if (pad && ((bits.find("2") != bits.npos) || (bits.find("1.5") != bits.npos))) { printf("don't need explicit padding with > 1 stop bit\n"); pad = 0; }

    int retval = RenXt_open(port.c_str(), baud_rate, bits.c_str(), /*UnPercent*/(pad), fps);
    printf("open port '%s', baud %d, bits %s, pad %d (%2.1f%%), fps %d ... %s %d\n", port.c_str(), baud_rate, bits.c_str(), pad, pad? 100. / pad: 0, fps, (retval < 0)? "error": "buf size", retval);
    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Okay;
}
CommandHandler open_cmd(open_port);


//close a port(s):
CommandHandler::Result close_port(std::string& cmdbuf)
{
    const int port_inx = 4+1, junk_inx = 6+1;
//    boost::regex close_cmd("^\\s*c(l(o(se?)?)?)?(\\s+([A-Z0-9_$:]))?(\\s+(.*))?\\s*$", boost::regex::icase);
    myRegEx close_cmd("^" WHSP_REGEX(0) "c(l(o(se?)?)?)?" PORT_REGEX "?" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//	boost::smatch parts;

//    if (boost::regex_search(inbuf, parts, CommandHandler::help_cmd))
    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "c[lose] <port> | \"all\" = close port (allows it to be used elsewhere)";
        return CommandHandler::Result::Okay;
    }
    if (!close_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    if (!close_cmd.GetMatch(junk_inx).empty()) return invalid("Close junk found: '%s'\n", (const char*)close_cmd.GetMatch(junk_inx).c_str());
    std::string/*&*/ port = close_cmd.GetMatch(port_inx);
//    while (!port.empty() && isspace(port.front()) port.pop_front();
    if (port.empty()) return invalid("missing port\n");

    if (!stricmp(port.c_str(), "all")) port.erase(0);
    int retval = RenXt_close(port.empty()? 0: port.c_str());
    printf("close port '%s' ... returned %d\n", port.empty()? "(all)": port.c_str(), retval);
    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Okay;
}
CommandHandler close_cmd(close_port);


//enumerate controllers on a port:
std::unordered_map<std::string, std::vector<std::string>> sample_cfg; //allow sample config file to be generated
const char* NodeTypes[] = {"Null ", "FrPan", "PWM- ", "PWM+ ", "Chpl-", "Chpl+", "GECE!", "GECE=",
    "??8??", "??9??", "281X!", "281X=", "??12?", "??13?", "??14?", "??15?"};
CommandHandler::Result enum_ctlr(std::string& cmdbuf)
{
    const int port_inx = 3+1, junk_inx = 5+1;
//    boost::regex enum_cmd("^\\s*e(n(um?)?)?(\\s+([A-Z0-9_$:]+))?(\\s+(.*))?\\s*$", boost::regex::icase);
    myRegEx enum_cmd("^" WHSP_REGEX(0) "e(n(um?)?)?" PORT_REGEX "?" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//	boost::smatch parts;
	static std::unordered_map<int, std::string> device_codes = {{0x28, "12F1840"}, {0x68, "16F688"}, {0x85, "16F1825"}, {0x87, "16F1827"}};
//	static std::hash_map<int, int> device_ram;
#if 0
	if (device_codes.empty())
    {
//	device_codes[0x26] = "PIC12F675";
        device_codes[0x28] = "12F1840"; //device_ram[0x28] = 256;
        device_codes[0x68] = "16F688"; //device_ram[0x68] = 256;
//    device_codes[0x83] = "PIC16F1823";
//    device_codes[0x84] = "PIC16F1824";
        device_codes[0x85] = "16F1825"; //device_ram[0x85] = 1024;
//    device_codes[0x86] = "PIC16F1826";
        device_codes[0x87] = "16F1827"; //device_ram[0x87] = 368;
//    device_codes[0x88] = "PIC16F1828";
//    device_codes[0x89] = "PIC16F1829";
//    device_codes[0xc7] = "PIC16F1847";
    }
#endif // 0

//    if (boost::regex_search(inbuf, parts, CommandHandler::help_cmd))
    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "e[num] <port> = enumerate controllers on an open port";
        return CommandHandler::Result::Okay;
    }
    if (!enum_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    if (!enum_cmd.GetMatch(junk_inx).empty()) return invalid("Help junk found: '%s'\n", (const char*)enum_cmd.GetMatch(junk_inx).c_str());
    std::string/*&*/ port = enum_cmd.GetMatch(port_inx);
//    while (!port.empty() && isspace(port.front()) port.pop_front();
    if (port.empty()) return invalid("missing port\n");

    RenXt_Ctlr ctlrs[50];
    int retval = RenXt_enum(port.c_str(), ctlrs, numents(ctlrs));
    printf("enum port '%s' ... %s: %d\n", port.c_str(), (retval >= 0)? "controllers found": "error", retval);
    printf("adrs  proc  firm pins ram baud clk ntype nodes     #i/o ser per name\n");

    std::vector<std::string>& port_cfg = sample_cfg[port];
    port_cfg.clear();
    sprintf_back(port_cfg, "#%s: enum " __DATE__ " " __TIME__ "\n", port.c_str());
    port_cfg.push_back("#name = port, node type, order, #nodes per controller, max palette series,parallel, width,height, #nodes, node ram, ram scale\n");

    for (int i = 0; i < retval; ++i)
    {
        char ramdesc[5]; //, last_prerr[5];
        int ramscale = (ctlrs[i].ram <= 256)? 1: (ctlrs[i].ram <= 512)? 2: 4;
        if (ctlrs[i].ram < 1000) sprintf(ramdesc, "%3d", ctlrs[i].ram);
        else sprintf(ramdesc, "%2dK", rdiv(ctlrs[i].ram, 1024));
//        printf("ctlr[%d]: name 0x%x '%s', address 0x%x, type %s, firmware 0x%x, %d I/O pins (series on %x), ram %d, max baud %.1fk, clock %.3f MHz, node type 0x%x, #nodes %d, #io chars %d, #io errs %d, #proto errs %d\n", i, ctlrs[i].name[0], ctlrs[i].name, ctlrs[i].address, (device_codes.find(ctlrs[i].uctlr_type) != device_codes.end())? device_codes[ctlrs[i].uctlr_type].c_str(): "(unknown)", ctlrs[i].fwver, ctlrs[i].pins >> 8, ctlrs[i].pins & 0xff, ctlrs[i].ram, ctlrs[i].max_baud/1000., ctlrs[i].clock/1000000., ctlrs[i].node_type, ctlrs[i].num_nodes, ctlrs[i].iochars, ctlrs[i].ioerrs, ctlrs[i].protoerrs);
//        if (ctlrs[i].protoerrs) sprintf(last_prerr, ":%d", ctlrs[i].last_prerr);
//        else last_prerr[0] = '\0';
        std::string devdesc = (device_codes.find(ctlrs[i].uctlr_type) != device_codes.end())? device_codes[ctlrs[i].uctlr_type]: "UNKN";
        if (devdesc.length() > 6) devdesc = devdesc.substr(devdesc.length() - 6); //truncate if too long
        printf("0x%.2x%7s %d.%.2d %x+%x %s %3.0fk %2.0fM %s %5d%9d %3d %x:%x %s\n", /*i,*/ ctlrs[i].address, devdesc.c_str(), ctlrs[i].fwver / 0x10, ctlrs[i].fwver % 0x10, std::min<int>(ctlrs[i].pins >> 8, 15), ctlrs[i].pins & 0xff, ramdesc, ctlrs[i].max_baud/1000., ctlrs[i].clock/1000000., NodeTypes[ctlrs[i].node_type & 0xF], ctlrs[i].num_nodes, ctlrs[i].iochars, ctlrs[i].ioerrs, ctlrs[i].protoerrs / 0x10, ctlrs[i].protoerrs % 0x10, ctlrs[i].name);
        if (!ctlrs[i].name[0]) sprintf(ctlrs[i].name, "prop[%d]", ctlrs[i].address);
        sprintf_back(port_cfg, "%s = %s:, 0x%x, %s, %d, %d,%d, %d,%d, %d, %d\\2\\4, %d #%s, %d/%d bytes\n", ctlrs[i].name, port.c_str(), ctlrs[i].node_type, "RGB", (ctlrs[i].ram - 48) * 2, 16, ((ctlrs[i].ram <= 256)? 48: (ctlrs[i].ram <= 512)? 64: 256) / 4, 0, 0, (ctlrs[i].ram - 48) * 2, /*divup(ctlrs[i].ram - 48, ramscale)*/ ctlrs[i].ram - 48, ramscale, (device_codes.find(ctlrs[i].uctlr_type) != device_codes.end())? device_codes[ctlrs[i].uctlr_type].c_str(): "UNKNOWN DEVICE", ctlrs[i].ram - 48, ramscale);
    }
    if (retval == numents(ctlrs)) { printf("(maybe more)\n"); port_cfg.push_back("#maybe more"); }
    else port_cfg.push_back("#end port");
    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Okay;
}
CommandHandler enum_cmd(enum_ctlr);


//write example plugin config file:
FileInfo cfgfile;
CommandHandler::Result file_gen(std::string& cmdbuf)
{
    const int port_inx = 5+1, junk_inx = 7+1;
//    boost::regex enum_cmd("^\\s*e(n(um?)?)?(\\s+([A-Z0-9_$:]+))?(\\s+(.*))?\\s*$", boost::regex::icase);
    myRegEx file_cmd("^" WHSP_REGEX(0) "f(i(le?)?)?" PORT_REGEX "?" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//	boost::smatch parts;

//    if (boost::regex_search(inbuf, parts, CommandHandler::help_cmd))
    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "f[ile] <port> = write sample plug-in config file based on enum results";
        return CommandHandler::Result::Okay;
    }
    if (!file_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    if (!file_cmd.GetMatch(junk_inx).empty()) return invalid("Discover junk found: '%s'\n", (const char*)file_cmd.GetMatch(junk_inx).c_str());
    std::string/*&*/ port = file_cmd.GetMatch(port_inx);
//    while (!port.empty() && isspace(port.front()) port.pop_front();
//    if (port.empty()) printf("writing all known ports\n"); //return invalid("missing port\n");
//    else printf("writing port %s\n", port.c_str());

    std::vector<std::string> global_cfg;
    global_cfg.push_back("#sample RenXt config settings\n");
    global_cfg.push_back("\n");
    global_cfg.push_back("#global config settings:\n");
    sprintf_back(global_cfg, "#debug_file = %s\n", RenXt_debug_file.c_str());
    sprintf_back(global_cfg, "#debug_level = %d\n", RenXt_debug_level);
    sprintf_back(global_cfg, "palovfl = %d\n", RenXt_palovfl);
    sprintf_back(global_cfg, "dedup = %d\n", dedup);
    global_cfg.push_back("\n");

    int lines = 0;
    std::ofstream outstream;
    outstream.open(cfgfile.path, std::ofstream::out | std::ofstream::app);
    if (!outstream.is_open()) printf("unable to write '%s'\n", cfgfile.path.c_str());
    else
    {
        if (outstream.tellp()) endl(outstream); //.write("\n", 1);
        for (auto it = global_cfg.begin(); it != global_cfg.end(); ++it)
            outstream.write(it->c_str(), it->size());
        lines += global_cfg.size();
        for (auto it = sample_cfg.begin(); it != sample_cfg.end(); ++it)
        {
            if (!port.empty() && !port.compare(it->first.c_str())) continue; //don't want this one
            printf("writing enum results for '%s'\n", it->first.c_str());
            for (auto it2 = it->second.begin(); it2 != it->second.end(); ++it2)
                outstream.write(it2->c_str(), it2->size());
            lines += it->second.size();
        }
        outstream.close();
        printf("total lines written to '%s': %d\n", cfgfile.path.c_str(), lines);
    }

    printf("\n");
    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Okay;
}
CommandHandler file_cmd(file_gen);


//check if anybody is out there listening:
//TODO: combine with enum?
CommandHandler::Result discover_ctlr(std::string& cmdbuf)
{
    const int port_inx = 5+1, junk_inx = 7+1;
//    boost::regex enum_cmd("^\\s*e(n(um?)?)?(\\s+([A-Z0-9_$:]+))?(\\s+(.*))?\\s*$", boost::regex::icase);
    myRegEx disc_cmd("^" WHSP_REGEX(0) "dis(c(o(v(er?)?)?)?)?" PORT_REGEX "?" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//	boost::smatch parts;

//    if (boost::regex_search(inbuf, parts, CommandHandler::help_cmd))
    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "dis[cover] <port> = discover if any controllers on listening on an open port";
        return CommandHandler::Result::Okay;
    }
    if (!disc_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    if (!disc_cmd.GetMatch(junk_inx).empty()) return invalid("Discover junk found: '%s'\n", (const char*)disc_cmd.GetMatch(junk_inx).c_str());
    std::string/*&*/ port = disc_cmd.GetMatch(port_inx);
//    while (!port.empty() && isspace(port.front()) port.pop_front();
    if (port.empty()) return invalid("missing port\n");

    byte ctlrs[256];
    int retval = RenXt_discover(port.c_str(), ctlrs, numents(ctlrs));
    printf("enum port '%s' ... %s: %d\naddresses: ", port.c_str(), (retval >= 0)? "controllers found": "error", retval);
    for (int i = 0; i < retval; ++i)
        printf(", 0x%x" + (i? 0: 2), ctlrs[i]);
    if (retval == numents(ctlrs)) printf("(maybe more)\n");
    printf("\n");
    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Okay;
}
CommandHandler discover_cmd(discover_ctlr);

#define unused(thing)  (thing)

//play animated .GIF on a controller:
CommandHandler::Result play(std::string& cmdbuf)
{
    const int port_inx = 3+1, ctlr_inx = 5+1, file_inx = 7+1, junk_inx = 9+1;
//    boost::regex play_cmd("^\\s*p(l(ay?)?)?(\\s+([A-Z0-9_$:]))?(\\s+([0-9]+|0x[0-9A-F]+))?(\\s+([^ ]+|\"[^\"]]+\"))?(\\s+(.*))?\\s*$", boost::regex::icase);
    myRegEx play_cmd("^" WHSP_REGEX(0) "p(l(ay?)?)?" PORT_REGEX "?" HEXNUM_REGEX "?" STRING_REGEX "?" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//	boost::smatch parts;

    unused(port_inx);
    unused(ctlr_inx);
    unused(file_inx);
    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "p[lay] <port> <controller> <file> = play animated .GIF on controller";
        return CommandHandler::Result::Okay;
    }
    if (!play_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    if (!play_cmd.GetMatch(junk_inx).empty()) return invalid("Play junk found: '%s'\n", (const char*)play_cmd.GetMatch(junk_inx).c_str());
    printf("TODO: play\n");
    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Okay;
}
CommandHandler play_cmd(play);


//send command(s) to controller:
CommandHandler::Result send(std::string& cmdbuf)
{
    const int port_inx = 3+1, ctlr_inx = 5+1, bytes_inx = 7+1;
//    boost::regex send_cmd("^\\s*s(e(nd?)?)?(\\s+([A-Z0-9_$:]))?(\\s+([0-9]+|0x[0-9A-F]+))?(\\s+(.*))?\\s*$", boost::regex::icase);
    myRegEx send_cmd("^" WHSP_REGEX(0) "s(e(nd?)?)?" PORT_REGEX "?" HEXNUM_REGEX "?" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//	boost::smatch parts;

    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "s[end] <port> [<controller> <byte values>] = enqueue bytes or flush";
        return CommandHandler::Result::Okay;
    }
    if (!send_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    std::string port = send_cmd.GetMatch(port_inx);
    std::string bytestr = send_cmd.GetMatch(bytes_inx);
    if (bytestr.empty()) //flush
    {
        if (send_cmd.GetMatch(ctlr_inx).size()) printf("flush ignores controller: '%s'\n", (const char*)send_cmd.GetMatch(ctlr_inx).c_str());
//        int retval = RenXt_close(port.c_str());
//        if (retval >= 0) retval = RenXt_reopen(port.c_str());
        int retval = RenXt_command(port.c_str(), 0, 0, 0); //flush
        printf("flush port '%s' ... returned %d\n", port.c_str(), retval);
    }
    else //enqueue
    {
//        printf("byte str '%s'\n", bytestr.c_str());
        byte ctlr = get_byte(send_cmd.GetMatch(ctlr_inx));
//      printf("ctlt %s = %d\n", parts[ctlr_inx].str().c_str(), ctlr);
        if (ctlr == ADRS_NONE) printf("sending to null address on port %s\n", port.c_str());
        if (ctlr == ADRS_ALL) printf("sending to all controllers on port %s\n", port.c_str());
        std::vector<byte> bytes;
        get_values<byte>(bytestr, bytes);
        if (!bytestr.empty()) return invalid("Send junk found: '%s'\n", bytestr.c_str());
        if (!bytes.size()) return invalid("nothing to send\n");
        int retval = RenXt_command(port.c_str(), ctlr, reinterpret_cast</*NOPE(const)*/ byte*>(&bytes[0]), bytes.size());
        printf("enque port '%s' command to ctlr 0x%x (%lu bytes) ... returned %d\n", port.c_str(), ctlr, bytes.size(), retval);
    }
    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Okay;
}
CommandHandler send_cmd(send);


//show version info:
CommandHandler::Result version(std::string& cmdbuf)
{
    const int junk_inx = 6+1;
    myRegEx ver_cmd("^" WHSP_REGEX(0) "v(e(r(s(i(on?)?)?)?)?)?" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//	boost::smatch parts;

    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "v[ersion] = show version info";
        return CommandHandler::Result::Okay;
    }
    if (!ver_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    if (!ver_cmd.GetMatch(junk_inx).empty()) return invalid("Version junk found: '%s'\n", (const char*)ver_cmd.GetMatch(junk_inx).c_str());
    printf("RenXt_tool: version 0x%x (" __DATE__ " " __TIME__ ")\n", MY_VERSION);
    printf("Protocol: version 0x%x\n", RENXt_VERSION);
    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Okay;
}
CommandHandler ver_cmd(version);


//quit:
CommandHandler::Result quit(std::string& cmdbuf)
{
    const int junk_inx = 3+1;
    myRegEx quit_cmd("^" WHSP_REGEX(0) "q(u(it?)?)?" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//	boost::smatch parts;

    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "q[uit] = exit";
        return CommandHandler::Result::Okay;
    }
    if (!quit_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    if (!quit_cmd.GetMatch(junk_inx).empty()) return invalid("Quit junk found: '%s'\n", (const char*)quit_cmd.GetMatch(junk_inx).c_str());
    printf("bye.\n");
    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Exit;
}
CommandHandler quit_cmd(quit);


//show help info:
CommandHandler::Result help(std::string& cmdbuf)
{
    const int junk_inx = 4+1;
    myRegEx help_cmd("^" WHSP_REGEX(0) "(h(e(lp?)?)?|\\?)" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//	boost::smatch parts;

    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "help | \"?\" = this help text";
        return CommandHandler::Result::Okay;
    }
    if (!help_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    if (!help_cmd.GetMatch(junk_inx).empty()) return invalid("Help junk found: '%s'\n", (const char*)help_cmd.GetMatch(junk_inx).c_str());
    printf("RenXt_tool commands:\n");
    CommandHandler::show_cmds();
//    printf("\n");
    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Okay;
}
CommandHandler help_cmd(help);

//#include "xLightsMain.h"
//#include "xlights_out.h"

//api dev test (hard-coded pattern):
CommandHandler::Result test(std::string& cmdbuf)
{
    const int junk_inx = 4+1;
    myRegEx test_cmd("^" WHSP_REGEX(0) "(t(e(st?)?)?|\\?)" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
//	boost::smatch parts;

    if (cmdbuf == CommandHandler::Help)
    {
        cmdbuf = "t[est] = hard-coded dev test";
        return CommandHandler::Result::Okay;
    }
    if (!test_cmd.Matches(cmdbuf)) return CommandHandler::Result::None; //not for me
    if (!test_cmd.GetMatch(junk_inx).empty()) return invalid("Test junk found: '%s'\n", (const char*)test_cmd.GetMatch(junk_inx).c_str());

#if 0 //plug-in test; NOTE: uses wxWidgets
    {
        byte testbuf[] =
        {
//byte testbuf[] = 6936 bytes:
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0
        };
//        xOutput xout;
//        wxString nettype("REN"), port("COM9:");
        int numch = numents(testbuf);
//        int myid = xout.addnetwork(nettype, numch, port, 250000);
        printf("package + send %d bytes\n", numch);
//        for (int i = 0; i < numents(testbuf); ++i)
//            xout.SetIntensity(i, testbuf[i]);
//        xout.TimerEnd();
    }
#endif // 1

#if 0 //api-only test
//    RenXt_palovfl = -1; //simpler color quantization
    byte xchbuf[256 *3] = {0}, outbuf[1200];
    RenXt_Prop propdesc[2] = {{0}};
    propdesc[0].width = propdesc[0].height = 16;
#if 1
    propdesc[0].node_type = RENXt_WS2811(SERIES); //0xA0;
    propdesc[0].order = GRB_ORDER; //NOTE: WS281X R + G swapped
    propdesc[0].numnodes = 256;
    propdesc[0].ctlrnodes = 256;
    propdesc[0].maxpal = 16;
#else
    propdesc[0].node_type = RENXt_CHPLEX(0xCC); //RENXt_WS2811(SERIES); //0xA0;
    propdesc[0].order = MONO_ANY; //RGB_ORDER; //0x524742; //"RGB"
    propdesc[0].numnodes = 56; //256;
    propdesc[0].ctlrnodes = 56; //256;
    propdesc[0].maxpal = 40; //16;
#endif
    propdesc[0].noderam = 0x20;
    strcpy(propdesc[0].frameset, "test"); //name of this set of related frames (used to select color map)
#if 0 //inverted
    chbuf[0] = 0xff; chbuf[299] = 0xff; chbuf[150] = chbuf[153] = chbuf[156] = 0x80;
#endif
#if 0 //4bpp bitmap
    for (int i = 0; i < 300; i += 3)
        chbuf[i] = i/60 + 10;
#endif
#if 0 //chplex
//    propdesc[0].node_type = 0x30; //CC
    propdesc[0].numnodes = 56;
    propdesc[0].ctlrnodes = 56;
//    chbuf[0] = 255;
//    chbuf[3] = 255;
//    chbuf[0] = chbuf[3] = chbuf[6] = chbuf[9] = chbuf[12] = chbuf[15] = chbuf[18] = 255;
//    chbuf[21] = chbuf[39] = 255;
//    for (int i = 0; i < 57; ++i) chbuf[3 * i] = 0x44;
    byte values[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40 ,50, 60, 70, 80, 90 ,100, 200};
    for (size_t i = 0; i < numents(values); ++i) chbuf[3 * i] = values[i];
#endif
#if 0 //palovfl
    byte chbuf[] = {
0xda, 0xff, 0, 0xff, 0, 0, 0xdf, 0xff, 0, 0, 0xff, 0x15, 0, 0xff, 0xdf, 0,
0x9f, 0xff, 0, 0x67, 0xff, 0, 0x76, 0xff, 0, 0xbf, 0xff, 0, 0xff, 0xcd, 0, 0xff,
0x3e, 0x54, 0xff, 0, 0xe8, 0xff, 0, 0xff, 0x97, 0, 0xff, 0x38, 0, 0xff, 0, 0, 0,
0xff, 0x38, 0, 0xff, 0, 0, 0xff, 0x59, 0, 0xff, 0xd7, 0, 0x9e, 0xff, 0, 0x0d,
0xff, 0, 0, 0xff, 0x6a, 0, 0xff, 0xc5, 0, 0xff, 0xf8, 0, 0xff, 0xe6, 0, 0xff,
0x8e, 0x15, 0xff, 0, 0xf2, 0xff, 0, 0xff, 0, 0, 0xd6, 0xff, 0, 0, 0xff, 0x46,
0, 0xb4, 0xff, 0, 0xff, 0x3e, 0xe2, 0xff, 0, 0xff, 0, 0, 0xff, 0xee, 0, 0x4e,
0xff, 0, 0, 0xff, 0x1f, 0, 0xff, 0x4c, 0, 0xff, 0x3a, 0x0e, 0xff, 0, 0x80, 0xff,
0, 0xff, 0xfc, 0, 0xff, 0x72, 0, 0xff, 0, 0, 0xff, 0x59, 0, 0xff, 0x97, 0,
0xe8, 0xff, 0, 0xff, 0xd7, 0, 0xff, 0x72, 0, 0xff, 0, 0, 0xff, 0x7e, 0, 0xff,
0xf9, 0, 0x9d, 0xff, 0, 0x62, 0xff, 0, 0x61, 0xff, 0, 0xa1, 0xff, 0, 0xff, 0xcf,
0, 0xff, 0, 0, 0xfb, 0xff, 0, 0, 0xff, 0x20, 0, 0xbf, 0xff, 0x2b, 0, 0xff,
0xea, 0, 0xff, 0x16, 0, 0xff, 0, 0xe4, 0xff, 0x11, 0xff, 0, 0xff, 0xdb, 0, 0xff,
0, 0, 0xff, 0x9a, 0, 0xff, 0xef, 0, 0xff, 0xff, 0, 0xff, 0xd3, 0, 0xff, 0x75,
0, 0xff, 0, 0, 0xff, 0x7e, 0, 0xff, 0xfc, 0, 0x9e, 0xff, 0, 0x54, 0xff, 0,
0, 0xff, 0x3e, 0x0d, 0xff, 0, 0x80, 0xff, 0, 0xff, 0xf9, 0, 0xff, 0x75, 0, 0xff,
0, 0, 0xff, 0x53, 0, 0xff, 0x77, 0, 0xff, 0x59, 0, 0xff, 0, 0, 0xff, 0xa7,
0, 0x59, 0xff, 0, 0, 0xff, 0xb9, 0, 0x2b, 0xff, 0xd2, 0, 0xff, 0xff, 0, 0x86,
0xff, 0, 0x37, 0xff, 0, 0xb8, 0x76, 0, 0xff, 0, 0xb1, 0xff, 0, 0xff, 0x34, 0xcf,
0xff, 0, 0xff, 0x67, 0, 0xff, 0, 0, 0xff, 0x1f, 0, 0xff, 0, 0, 0xff, 0x53,
0, 0xff, 0xd3, 0, 0x9d, 0xff, 0, 0x0e, 0xff, 0, 0, 0xff, 0x6a, 0, 0xff, 0xcd,
0, 0xbf, 0xff, 0, 0xff, 0xc5, 0, 0xff, 0x3a, 0x62, 0xff, 0, 0xff, 0xff, 0, 0xff,
0x77, 0, 0xff, 0x1f, 0, 0xff, 0, 0, 0xff, 0x19, 0, 0xff, 0x97, 0, 0x99, 0xff,
0, 0, 0xff, 0x71, 0, 0x59, 0xff, 0xc5, 0, 0xff, 0xff, 0, 0x73, 0xff, 0, 0x15,
0xff, 0, 0x3d, 0xff, 0, 0x5a, 0xe2, 0, 0xff, 0, 0x54, 0xff, 0, 0xff, 0x73, 0xb7,
0xff, 0, 0xff, 0x7c, 0, 0xff, 0, 0, 0xff, 0x19, 0, 0xff, 0, 0, 0xff, 0x59,
0, 0xff, 0xef, 0, 0x61, 0xff, 0, 0, 0xff, 0x4c, 0, 0xff, 0xf8, 0, 0x76, 0xff,
0, 0x67, 0xff, 0, 0xff, 0xe6, 0, 0xff, 0x1f, 0xa1, 0xff, 0, 0xff, 0x9a, 0, 0xff,
0, 0, 0xff, 0x67, 0, 0xff, 0x97, 0, 0xff, 0x7c, 0, 0xff, 0, 0, 0xff, 0xde,
0, 0, 0xff, 7, 0, 0x9b, 0xff, 0xae, 0, 0xff, 0xff, 0, 0x9f, 0xff, 0, 0xa3,
0x9c, 0, 0xff, 0xe2, 0, 0xff, 0, 0, 0xff, 0, 0xff, 0xbd, 0xda, 0xff, 0, 0xff,
 0, 0xb7, 0xff, 0, 0x99, 0xff, 0, 0xcf, 0xff, 0, 0xff, 0xa7,
0, 0xff, 0, 0, 0xff, 0xcf, 0, 0x4e, 0xff, 0, 0, 0xff, 0x8e, 0, 0x9f, 0xff,
0, 0xff, 0xdf, 0x15, 0xff, 0, 0xff, 0xee, 0, 0xff, 0, 0, 0xff, 0xdb, 0, 0x59,
0xff, 0, 0, 0xff, 0x34, 0, 0xff, 0x71, 0, 0xff, 0x73, 0, 0xff, 7, 0xda, 0xff,
0, 0xff, 0, 0, 0x9c, 0xff, 0, 0, 0xd8, 0xff, 0, 0, 0xff, 0, 0x1b, 0xff,
0, 0xff, 0xff, 0, 0xff, 0xb9, 0x48, 0xff, 0, 0xff, 0, 0, 0x9c, 0xff, 0, 0, 0,
0xff, 0xbd, 0, 0x9b, 0xff, 0, 0x54, 0xff, 0, 0x59, 0xff, 0, 0xb1, 0xff, 0, 0xff,
0xb9, 0x11, 0xff, 0, 0xfb, 0xff, 0, 0xff, 0, 0, 0xf2, 0xff, 0, 0, 0xff, 0x15,
0xdf, 0xff, 0, 0xff, 0, 0, 0xe2, 0xff, 0, 0, 0xff, 0x20, 0, 0xe4, 0xff, 0,
0x2b, 0xff, 0x76, 0, 0xff, 0xc5, 0, 0xff, 0xe2, 0, 0xff, 0xae, 0, 0xff, 0, 0, 0,
0xff, 0, 0xd8, 0xff, 0x48, 0xff, 0, 0xff, 0, 0, 0xff, 0xff, 0, 0xc9, 0xff, 0,
0xff, 0, 0, 0xff, 0, 0, 0xff, 0xff, 0, 0, 0xff, 0xb9, 0, 0, 0xff, 0xe2,
0, 0xff, 0xff, 0, 0x9f, 0xff, 0, 0x5a, 0xff, 0, 0x73, 0xff, 0, 0xb8, 0xd2, 0,
0xff, 0x16, 0, 0xff, 0, 0xbf, 0xff, 0, 0xff, 0x3e, 0xd6, 0xff, 0, 0xff, 0, 0, 0,
0xda, 0xff, 0, 0, 0xff, 0x46, 0, 0xb4, 0xff, 0x2b, 0, 0xff, 0xea, 0, 0xff, 0, 0,
0, 0x86, 0xff, 0, 0x37, 0xff, 0, 0x15, 0xff, 0, 0x3d, 0xff, 0, 0xa3, 0x9c, 0,
0xff, 0, 0x1b, 0xff, 0, 0xff, 0xff, 0xc9, 0xff, 0, 0xff, 0, 0, 0xff, 0, 0, 0};
#endif
#if 1 //palovfl
    byte chbuf[] = {
0, 0, 0, 1, 0, 0, 3, 0, 0, 5, 0, 0, 8, 0, 0, 0x0a,
0, 0, 0x0c, 0, 0, 0x0e, 0, 0, 0x0e, 0, 0, 0x0c, 0, 0, 0x0a, 0,
0, 8, 0, 0, 5, 0, 0, 3, 0, 0, 1, 0, 0, 0, 0, 0,
1, 0, 0, 8, 0, 0, 0x0e, 0, 0, 0x15, 0, 0, 0x1c, 0, 0, 0x25,
0, 0, 0x2b, 0, 0, 0x33, 0, 0, 0x33, 0, 0, 0x2b, 0, 0, 0x25, 0,
0, 0x1c, 0, 0, 0x15, 0, 0, 0x0e, 0, 0, 8, 0, 0, 1, 0, 0,
3, 0, 0, 0x0e, 0, 0, 0x1a, 0, 0, 0x27, 0, 0, 0x31, 0, 0, 0x3d,
0, 0, 0x47, 0, 0, 0x53, 0, 0, 0x53, 0, 0, 0x47, 0, 0, 0x3d, 0,
0, 0x31, 0, 0, 0x27, 0, 0, 0x1a, 0, 0, 0x0e, 0, 0, 3, 0, 0,
5, 0, 0, 0x15, 0, 0, 0x27, 0, 0, 0x37, 0, 0, 0x47, 0, 0, 0x57,
0, 0, 0x67, 0, 0, 0x77, 0, 0, 0x77, 0, 0, 0x67, 0, 0, 0x57, 0,
0, 0x47, 0, 0, 0x37, 0, 0, 0x27, 0, 0, 0x15, 0, 0, 5, 0, 0,
8, 0, 0, 0x1c, 0, 0, 0x31, 0, 0, 0x47, 0, 0, 0x5b, 0, 0, 0x6f,
0, 0, 0x84, 0, 0, 0x97, 0, 0, 0x97, 0, 0, 0x84, 0, 0, 0x6f, 0,
0, 0x5b, 0, 0, 0x47, 0, 0, 0x31, 0, 0, 0x1c, 0, 0, 8, 0, 0,
0x0a, 0, 0, 0x25, 0, 0, 0x3d, 0, 0, 0x57, 0, 0, 0x6f, 0, 0, 0x87,
0, 0, 0xa0, 0, 0, 0xb8, 0, 0, 0xb8, 0, 0, 0xa0, 0, 0, 0x87, 0,
0, 0x6f, 0, 0, 0x57, 0, 0, 0x3d, 0, 0, 0x25, 0, 0, 0x0a, 0, 0,
0x0c, 0, 0, 0x2b, 0, 0, 0x47, 0, 0, 0x67, 0, 0, 0x84, 0, 0, 0xa0,
0, 0, 0xbf, 0, 0, 0xdd, 0, 0, 0xdd, 0, 0, 0xbf, 0, 0, 0xa0, 0,
0, 0x84, 0, 0, 0x67, 0, 0, 0x47, 0, 0, 0x2b, 0, 0, 0x0c, 0, 0,
0x0e, 0, 0, 0x33, 0, 0, 0x53, 0, 0, 0x77, 0, 0, 0x97, 0, 0, 0xb8,
0, 0, 0xdd, 0, 0, 0xff, 0, 0, 0xff, 0, 0, 0xdd, 0, 0, 0xb8, 0,
0, 0x97, 0, 0, 0x77, 0, 0, 0x53, 0, 0, 0x33, 0, 0, 0x0e, 0, 0,
0x0e, 0, 0, 0x33, 0, 0, 0x53, 0, 0, 0x77, 0, 0, 0x97, 0, 0, 0xb8,
0, 0, 0xdd, 0, 0, 0xff, 0, 0, 0xff, 0, 0, 0xdd, 0, 0, 0xb8, 0,
0, 0x97, 0, 0, 0x77, 0, 0, 0x53, 0, 0, 0x33, 0, 0, 0x0e, 0, 0,
0x0c, 0, 0, 0x2b, 0, 0, 0x47, 0, 0, 0x67, 0, 0, 0x84, 0, 0, 0xa0,
0, 0, 0xbf, 0, 0, 0xdd, 0, 0, 0xdd, 0, 0, 0xbf, 0, 0, 0xa0, 0,
0, 0x84, 0, 0, 0x67, 0, 0, 0x47, 0, 0, 0x2b, 0, 0, 0x0c, 0, 0,
0x0a, 0, 0, 0x25, 0, 0, 0x3d, 0, 0, 0x57, 0, 0, 0x6f, 0, 0, 0x87,
0, 0, 0xa0, 0, 0, 0xb8, 0, 0, 0xb8, 0, 0, 0xa0, 0, 0, 0x87, 0,
0, 0x6f, 0, 0, 0x57, 0, 0, 0x3d, 0, 0, 0x25, 0, 0, 0x0a, 0, 0,
8, 0, 0, 0x1c, 0, 0, 0x31, 0, 0, 0x47, 0, 0, 0x5b, 0, 0, 0x6f,
0, 0, 0x84, 0, 0, 0x97, 0, 0, 0x97, 0, 0, 0x84, 0, 0, 0x6f, 0,
0, 0x5b, 0, 0, 0x47, 0, 0, 0x31, 0, 0, 0x1c, 0, 0, 8, 0, 0,
5, 0, 0, 0x15, 0, 0, 0x27, 0, 0, 0x37, 0, 0, 0x47, 0, 0, 0x57,
0, 0, 0x67, 0, 0, 0x77, 0, 0, 0x77, 0, 0, 0x67, 0, 0, 0x57, 0,
0, 0x47, 0, 0, 0x37, 0, 0, 0x27, 0, 0, 0x15, 0, 0, 5, 0, 0,
3, 0, 0, 0x0e, 0, 0, 0x1a, 0, 0, 0x27, 0, 0, 0x31, 0, 0, 0x3d,
0, 0, 0x47, 0, 0, 0x53, 0, 0, 0x53, 0, 0, 0x47, 0, 0, 0x3d, 0,
0, 0x31, 0, 0, 0x27, 0, 0, 0x1a, 0, 0, 0x0e, 0, 0, 3, 0, 0,
1, 0, 0, 8, 0, 0, 0x0e, 0, 0, 0x15, 0, 0, 0x1c, 0, 0, 0x25,
0, 0, 0x2b, 0, 0, 0x33, 0, 0, 0x33, 0, 0, 0x2b, 0, 0, 0x25, 0,
0, 0x1c, 0, 0, 0x15, 0, 0, 0x0e, 0, 0, 8, 0, 0, 1, 0, 0,
0, 0, 0, 1, 0, 0, 3, 0, 0, 5, 0, 0, 8, 0, 0, 0x0a,
0, 0, 0x0c, 0, 0, 0x0e, 0, 0, 0x0e, 0, 0, 0x0c, 0, 0, 0x0a, 0,
0, 8, 0, 0, 5, 0, 0, 3, 0, 0, 1, 0, 0, 0, 0, 0};
#endif
//    int retval = RenXt
//int RenXt_encode(const /*byte*/ void* inbuf, const /*byte*/ void* prev_inbuf, const RenXt_Prop* propdesc, byte* outbuf, size_t outlen, int pad_rate, int seqnum, 5, 3);
    int retval = RenXt_encode(chbuf, NULL, propdesc, outbuf, sizeof(outbuf), 5, 0);
    printf("test encode %d returned %d\n", sizeof(chbuf), retval);
    if (retval > 0) showbuf("test buf", outbuf, retval, true);
    if (retval > 0)
    {
        retval = RenXt_command("com3", 0, outbuf, -retval);
        printf("test enqueue %d returned %d\n", sizeof(chbuf), retval);
        if (retval > 0)
        {
            retval = RenXt_command("com3", 0, outbuf, 0);
            printf("test flush %d returned %d\n", sizeof(chbuf), retval);
        }
    }
#endif // 0

    cmdbuf.erase(0); //consume entire line
    return CommandHandler::Result::Okay;
}
CommandHandler test_cmd(test);


#if 0
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>

void init(void)
{
    HMODULE hdll = LoadLibrary("plugin.dll");
    if (!hdll) { printf("no dll %d\n", GetLastError()}; return; }

    typedef extern "C" size_t (DLL_ENTPT *FormatOutput)(const char* portname, int seqnum, const /*byte*/ void* inbuf, const /*byte*/ void* prev_inbuf, size_t inlen, byte* outbuf, size_t maxoutlen);
    FormatOutput fmtout = (FormatOutput)GetProcAddress(hdll, "FormatOutput");
    if (!fmtout) { printf("no func %d\n", GetLastError()); }
    FreeLibrary(hdll);
}
#else
#define init()
#endif


#include "wxAppShim.h" //define wxWidgets console app

//main entry point:
int my_main(int argc, const char* argv[])
{
    /*std::vector<std::string>*/ std::deque<std::string> filebuf;
    std::string inbuf;
    FileInfo inifile;
//    CommandHandler::debug();
    RenXt_debug_level = -99;

#if 1
//    wxRegEx re("^([0-9])[0-9]*$"); //, wxRE_DEFAULT): wxRegEx(pattern, flags | wxRE_ADVANCED)
    myRegEx re("^" WHSP_REGEX(0) "((debug_file)|(debug_level)|(palovfl)|(dedup))\\s*=" INTNUM_REGEX "?" JUNK_REGEX "?" WHSP_REGEX(0) "$", wxRE_ICASE);
    assert(re.IsValid());
    wxString test = "palovfl = 123";
    printf("re valid? %d, match? %d, count %lu\n", re.IsValid(), re.Matches(test.ToStdString()), re.GetMatchCount());
    wxString valbuf1; //, valbuf2;
//    size_t stofs, stlen;

    if (re.Matches(test.ToStdString()))
        for (int i = 0; i < 3; ++i)
        {
            valbuf1 = re.GetMatch(i);
            printf("part [%d] '%s' \n", i, (const char*)valbuf1.c_str());
        }
#endif // 0

    init();
    if (argc > 1) //single command line only
        for (int i = 1; i < argc; ++i)
        {
            inbuf += argv[i];
            inbuf += ' ';
#pragma message WARN("TODO: change this to read section of ini file")
        }
    find_file("RenXtPlugin.cfg", argv[0], cfgfile);
//    printf("cmd line = %s\n", inbuf.c_str());
    if (!inbuf.size()) //read init script
        if (find_file("RenXt_tool.ini", argv[0], inifile))
        {
            std::string linebuf;
            while (std::getline(inifile.stream, linebuf)) //read entire file into memory, look for sections
            {
                std::string::size_type ofs;
                int joined = 0;

                if ((ofs = linebuf.find("#")) != std::string::npos) linebuf.erase(ofs); //remove comments
                while (linebuf.size() && (linebuf.back() == ' ')) linebuf.pop_back(); //trim
                while (!linebuf.empty() && (linebuf.back() == '\\')) //line continuation
                {
                    linebuf.pop_back(); //remove trailing "\"
                    std::string morebuf;
                    if (!std::getline(inifile.stream, morebuf)) break;
                    linebuf += morebuf;
                    ++joined;
                }
                if (linebuf.length()) debug(20, "save line[%d]: %d:'%s'", filebuf.size(), linebuf.length(), linebuf.c_str());
                filebuf.push_back(linebuf);
                while (joined-- > 0) filebuf.push_back(""); //preserve later line#s (for error reporting)
            }
            if (!inifile.stream.eof()) debug(1, "I/O error on RenXt_tool.ini: state %d, eof? %d, fail? %d, good? %d, bad? %d", inifile.stream.rdstate(), inifile.stream.eof(), inifile.stream.fail(), inifile.stream.good(), inifile.stream.bad());
            if (inifile.stream.is_open()) inifile.stream.close();
            printf("lines read from %s: %lu\n", inifile.path.c_str(), filebuf.size());
        }

    for (;;)
    {
        while (!inbuf.empty() && (inbuf.back() == ' ')) inbuf.pop_back(); //remove trailing spaces (regex doesn't seem to handle it)
        while (inbuf.empty()) //get another command
        {
            if (argc > 1) break; //already processed command line
//            while (inbuf.empty()) //get next line from file or user
            if (!filebuf.empty()) //get next line from file or user
            {
                inbuf = filebuf.front();
                filebuf.pop_front();
                continue;
            }
            printf("\nRenXt_tool> ");
//            inbuf.reserve(1024);
//            gets(&inbuf[0]); //(char*)(const char*)inbuf.c_str());
//            inbuf.resize(strlen(&inbuf[0])); //inbuf.c_str()));
            std::getline(std::cin, inbuf); //    std::ifstream stream;
            puts(inbuf.c_str()); //echo the command being executed
        }

        switch (CommandHandler::exec_all(inbuf))
        {
            case CommandHandler::Result::Okay: continue; //get next command
            case CommandHandler::Result::Exit: return 0; //quit
            case CommandHandler::Result::Invalid: break; //invalid command (already reported)
            case CommandHandler::Result::None:
                printf("Unrecognized: '%s'; type '?' for help\n", inbuf.c_str());
                break;
            default:
                printf("huh? '%s'\n", inbuf.c_str());
                break;
        }
        inbuf.erase(0); //consume entire line
    }
    return 0;
}

//eof
