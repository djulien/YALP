//node addon app (napi) helpers

#ifndef _NAPI_HELPERS
#define _NAPI_HELPERS

//#define WANT_EXAMPLES //example/dev-debug
//https://github.com/nodejs/node-addon-examples
//https://github.com/nodejs/node-addon-api#examples
//https://programmer.help/blogs/node.js-c-plug-in-practice-guide.html

#include <stdarg.h> //va_list, va_start(), va_end()
#include <type_traits> //std::remove_cvref<>, std::decay<>, std::remove_reference<>, std::remove_pointer<>, std::conditional<>, std::if_same<>, std::is_arithmetic<>, enable_if<>, is_same<>, const_cast<>, result_of<>, std::is_function<>
#include "counters.h" //custom macro counters
#include "macro-vargs.h" //macro var args


//end of string buf:
//CAUTION: points past last char
#ifndef strend
 #define strend(buf)  ((buf) + sizeof(buf))
#endif

//use in place of "this" when no instance needed
//use for decltype, which does not execute but needs an instance for context
#ifndef NULL_OF
 #define NULL_OF(cls)  ((cls*)0) //TODO: use std::declval() instead
#endif

//make a unique name for this line/macro:
//also gives a little debug info in the name
#ifndef THISLINE
 #define THISLINE(name)  CONCAT(name, __LINE__)
#endif

//execute stmts after func return:
//#define ONRET(stmts)  \
//struct THISLINE(onret) { THISLINE(onret)() {}; ~THISLINE(onret)() { stmts; } };  \
//THISLINE(onret) THISLINE(onret_inst)

//define a const symbol:
//doesn't use any run-time storage space
#ifndef CONSTDEF
 #define CONSTDEF(...)  UPTO_4ARGS(__VA_ARGS__, CONSTDEF_4ARGS, CONSTDEF_3ARGS, CONSTDEF_2ARGS, missing_arg) (__VA_ARGS__)
 #define CONSTDEF_2ARGS(name, item)  CONSTDEF_3ARGS(name, item, 0)
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


//poly fill:
#if __cplusplus < 202000L
 namespace std
 {
    template <typename T>
//    struct remove_cvref { typedef std::remove_cv_t<std::remove_reference_t<T>> type; };
    struct remove_cvref { typedef typename std::remove_cv<typename std::remove_reference<T>::type>::type type; };
    template <typename T>
    using remove_cvref_t = typename remove_cvref<T>::type;
 };
#endif


///////////////////////////////////////////////////////////////////////////////
////
/// napi instrumentation; minimally intrusive C++ hooks to expose classes/objects to Javascript
//

//buffers + externals: https://adaltas.com/en/2018/12/12/native-modules-node-js-n-api/
//externals: https://github.com/nodejs/node-addon-api/blob/master/doc/external.md
//see Napi::Buffer, Napi::ArrayBuffer, Napi::TypedArray
//to rcv buf from js:
//Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
//Buffer<t> Napi::Buffer<t>::New(env, data*, len, finalizer, hint*);
//?? NewBuffer(void* data, size, delete_cb, thing)


//allow code to compile with/out NAPI:
//Javascript (Node.js add-on) support is optional; code should compile okay without it
#ifdef NODE_GYP_MODULE_NAME //CAUTION: use macro from node-gyp, not napi.h (not #included yet)
#define USING_NAPI //easier to spell :P
//which Node API to use?
//V8 is older, requires more familiarity with V8
//NAPI is C-style api and works ok; #include <node_api.h>
//Node Addon API is C++ style but had issues in 2018; #include <napi.h>
//N-API is part of Node.js + maintained by Node.js team, guarantees ABI compatibility - shouldn't need to rebuild when Node.js updated
//therefore, use N-API (aka Node Addon API)
#include "napi.h" //Node Addon API


//generate a unique struct:
//used in overloaded function param lists
//(work-around in lieu of partial function template specialization)
//namespace my
//{
//TODO: just use std::integral_constant
template <int UNIQ>
//struct index { int value; index(int n): value(n) {}}; //static const int inx = N; };
struct UniqTag {};
//};


//printf-style napi error message:
//doesn't return?
Napi::Value err_napi(const Napi::Env& env, const char* fmt, ...)
{
    char msgbuf[300];
    va_list args;
    va_start (args, fmt);
    vsnprintf(msgbuf, sizeof(msgbuf), fmt, args);
    strcpy(strend(msgbuf) - 5, " ..."); //truncation indicator
    va_end(args);    
    Napi::TypeError::New(env, msgbuf).ThrowAsJavaScriptException();
    return env.Undefined(); //Napi::Number::New(info.Env(), 0); //TODO: undefined
}

//show Napi::Value type:
//only used for debug
//NOTE: Napi::Value always needs a context (env)
//use value.Env() to get env associated with a Value
const char* NapiType(Napi::Value napvalue)
{
    const char* fmt =
        napvalue.IsUndefined()? "Undefined (t %d)":
        napvalue.IsNull()? "Null (t %d)":
        napvalue.IsBoolean()? "Boolean (t %d)":
        napvalue.IsNumber()? "Number (t %d)":
        napvalue.IsBigInt()? "BigInt (t %d)": //NAPI_VERSION > 5
        napvalue.IsDate()? "Date (t %d)": //NAPI_VERSION > 4
        napvalue.IsString()? "String (t %d)":
        napvalue.IsSymbol()? "Symbol (t %d)":
        napvalue.IsArray()? "Array (t %d)":
        napvalue.IsArrayBuffer()? "ArrayBuffer (t %d)":
        napvalue.IsTypedArray()? "TypedArray (t %d)":
        napvalue.IsObject()? "Object (t %d)":
        napvalue.IsFunction()? "Function (t %d)":
        napvalue.IsPromise()? "Promise (t %d)":
        napvalue.IsDataView()? "DataView (t %d)":
        napvalue.IsBuffer()? "Buffer (t %d)":
        napvalue.IsExternal()? "External (t %d)":
        "unknown (t %d)";
    static char buf[30];
    snprintf(buf, sizeof(buf), fmt, napvalue.Type());
    return buf;
}

const char* NapiArgType(const Napi::CallbackInfo& info, int inx)
{
    return NapiType((info.Length() > inx)? info[inx]: info.Env().Undefined());
}


const char* NapiValue2str(Napi::Value napvalue)
{
    static char buf[100];
    if (napvalue.IsBoolean() || napvalue.IsNumber()) snprintf(buf, sizeof(buf), "%s %d", NapiType(napvalue), napvalue.As<Napi::Number>().Int32Value());
    else if (napvalue.IsDate()) snprintf(buf, sizeof(buf), "%s %d", NapiType(napvalue), napvalue.As<Napi::Number>().Int32Value()); //TODO
    else if (napvalue.IsString())
    {
//        !NAPI_OK(napi_get_value_string_utf8(that.env, that.value, str_val, sizeof(str_val) - 1, &str_len), that.env, "Get string value failed");
//        if (str_len >= sizeof(str_val) - 1) strcpy(str_val + sizeof(str_val) - 5, " ...");
//        else str_val[str_len] = '\0';
        std::string str = (std::string)napvalue.As<Napi::String>();
        snprintf(buf, sizeof(buf), "%s %d:%s", NapiType(napvalue), str.length(), str.c_str());
    }
    else snprintf(buf, sizeof(buf), "%s (todo)", NapiType(napvalue)); //, napvalue.As<Napi::Number>().Int32Value()); //TODO
//std::string str = napvalue.As<Napi::String>();
//                 !NAPI_OK(napi_get_value_string_utf8(that.env, that.value, str_val, sizeof(str_val) - 1, &str_len), that.env, "Get string value failed");
    return buf;
}


//module export chain:
//sets up recursive list of module exports using sequential (overloaded) parameter
//templates require nested function anyway, so just use overloaded function
//NOTE: __COUNTER__ can be used between occurrences even if used in other places; recursive template will prevent interference by skipping over (propagating) "missing" values
//template specialization by counter safely spans sections with no occurrences
template <int COUNT>
inline Napi::Object module_exports(Napi::Env env, Napi::Object exports, UniqTag<COUNT>)
{
//        return ExportList<COUNT - 1>::module_exports(env, exports);
//debug("(skipping module_export[%d])", COUNT);
    return module_exports(env, exports, UniqTag<COUNT - 1> {}); //include previous exports
}

//specialization to start empty list:
//recursion stops at 0
template <>
inline Napi::Object module_exports(Napi::Env env, Napi::Object exports, UniqTag<0>)
{
//debug("module_exports[0]");
    return exports; //return empty/prior list as-is
}

//add class to list of exports:
NEW_COUNTER(num_module_exports);
#define NAPI_EXPORT_MODULE(Init /*cls, cls_counter*/)  \
CONSTDEF(THISLINE(mod_count), saved, GET_COUNTER_POSTINC(num_module_exports));  \
inline Napi::Object module_exports(Napi::Env env, Napi::Object exports, UniqTag<THISLINE(mod_count)::saved>)  \
{  \
    exports = /*ExportList<THISLINE(next_export)::count - 1>::*/module_exports(env, exports, UniqTag<THISLINE(mod_count)::saved - 1> {}); /*get prev exports*/  \
    /*get_exports*/ /*Exported<cls, cls_counter>::*/Init(env, exports);  /*add new class to list*/  \
    return exports;  \
}
//debug("module_exports[%d]", THISLINE(mod_count)::saved);


#pragma message(YELLOW_MSG "TODO: NAPI_EXPORT_FUNCTION, generalize func export")
#if 0 //example
Napi::String Method(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();
  return Napi::String::New(env, "world");
}
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
  exports.Set(Napi::String::New(env, "hello"),
              Napi::Function::New(env, Method));
  return exports;
}
#endif //0


#if 1
//node_modules/node-addon-api/napi-inl.h
#define fix_NODE_API_MODULE(modname, regfunc)                 \
  napi_value __napi_ ## regfunc(napi_env env,             \
                                napi_value exports) {     \
    return Napi::RegisterModule(env, exports, regfunc);   \
  }                                                       \
  fix_NAPI_MODULE(modname, __napi_ ## regfunc)

#define fix_NAPI_MODULE(modname, regfunc)                  \
    fix_NAPI_MODULE_X(modname, regfunc, NULL, 0)

//~/.nvm/versions/node/v12.18.2/include/node/node_api.h
#define fix_NAPI_MODULE_X(modname, regfunc, priv, flags)                  \
  EXTERN_C_START                                                      \
    static napi_module _module =                                      \
    {                                                                 \
      NAPI_MODULE_VERSION,                                            \
      flags,                                                          \
      __FILE__,                                                       \
      regfunc,                                                        \
      #modname,                                                       \
      priv,                                                           \
      {0},                                                            \
    };                                                                \
    NAPI_C_CTOR(_register_ ## regfunc /*modname  FIXED HERE */) {                              \
      napi_module_register(&_module);                                 \
    }                                                                 \
  EXTERN_C_END
//  #define NAPI_C_CTOR(fn)    /* fn can't have special chars */                          \ 
//  static void fn(void) __attribute__((constructor)); \
//  static void fn(void)
#else
#define fix_NODE_API_MODULE(modname, regfunc)                 \
    NODE_API_MODULE(modname, regfunc)
#endif


//Javascript module exports:
//CONSTDEF(exp_modules_napi, count, GET_COUNTER_POSTINC(num_module_exports) - 1);
//kludge: NODE_API_MODULE macro wants a simple function name; wrap templated name
//TODO: embed within NAPI_EXPORT_CLASS?
//    exports = ExportList<GET_COUNTER_POSTINC(num_module_exports) - 1>::module_exports(env, exports);
#define NAPI_EXPORT_MODULES()  \
inline Napi::Object module_exports_shim(Napi::Env env, Napi::Object exports)  \
{  \
    exports = module_exports(env, exports, UniqTag<GET_COUNTER_POSTINC(num_module_exports) - 1> {});  \
    return exports;  \
}  \
/*NAPI_MODULE*/fix_NODE_API_MODULE(NODE_GYP_MODULE_NAME, module_exports_shim)
//NOTE: NODE_GYP_MODULE_NAME can't have special chars ^^
//    exports.Set("ccp_ctr", Napi::Number::New(env, __COUNTER__)); /*debug: show #recursive templates used*/
//    exports.Set("thrinx", Napi::Number::New(env, thrinx())); /*allow access to thread info without any object inst*/
//    exports.Set(/*Napi::String::New(env,*/ "jsdebug", Napi::Function::New(env, jsdebug));

//struct exported_modules_napi { enum { count = GET_COUNTER_POSTINC(num_module_exports) - 1}; };
//cumulative exports; put at end to export everything defined earlier
//CAUTION: NODE_API_MODULE has side effects; must use saved COUNTER
//#endif //def NODE_API_MODULE //NODE_GYP_MODULE_NAME


//class vs instance callbacks:
//define dual-purpose property descriptors to consolidate collection logic
//caller can decide which one to use
template<typename WrapType>
using DualPropDesc = std::pair<Napi::ClassPropertyDescriptor<WrapType>, Napi::PropertyDescriptor>;

//placeholder setter when static not needed:
//static void obj_nosetter_napi(const Napi::CallbackInfo& info, const Napi::Value& value) {}


//class member export chain:
//wrap selected getters/setters/methods and export to napi
//sets up recursive list of class exports using sequential (overloaded) parameter
//templates are required because ObjectWrap<> napi class not defined yet
//reduces verbosity + boilerplate coding within wrapped class
//NOTE: partial template specialization of class member functions !supported :(
//work-around: use parameter list overloading to reduce #template params to 1
//NOTE: __COUNTER__ can be used between occurrences even if used in other places; recursive template will prevent interference by skipping over (propagating) "missing" values
//template specialization by counter safely spans sections with no occurrences
#include <vector>
//current counter value doesn't matter at beginning of chain
NEW_COUNTER(num_cls_exports);
//#define NAPI_START_EXPORTS(...)  //noop
#if 1 //TODO: merge with NAPI_ADD_EXPORT
#define NAPI_START_EXPORTS(...)  UPTO_2ARGS(__VA_ARGS__, NAPI_START_EXPORTS_2ARGS, NAPI_START_EXPORTS_1ARG) (__VA_ARGS__)
//no inheritance; start with empty list:
//#define NAPI_START_EXPORTS_1ARG(cls)  NAPI_START_EXPORTS_2ARGS(cls, cls) //NoBaseClass)
#define NAPI_START_EXPORTS_1ARG(cls)  NAPI_START_EXPORTS_2ARGS(cls, cls) //NoBaseClass)
//inheritance; start with list from base class:
//template<typename WrapType, typename PropType = Napi::ClassPropertyDescriptor<WrapType>, int COUNT>
#define NAPI_START_EXPORTS_2ARGS(cls, base)  \
public:  \
/*perfect fwd ctor params (first time only):*/  \
    template <typename ... ARGS>  \
    inline static cls*& singleton(ARGS&& ... args)  \
    {  \
/*TODO: convert to smart ptr/STATIC_WRAP?*/  \
/*TODO: no longer needed?*/  \
        static cls* m_singleton = 0;  \
        if (!m_singleton) base::singleton() = m_singleton = 0; /*req def ctor new cls(std::forward<ARGS>(args) ...)*/; /*first time only; CAUTION: override base singleton also*/  \
/*debug(PINK_MSG #cls " singleton@ %#p", m_singleton)*/;  \
        return m_singleton;  \
    }  \
/*private:*/  \
template<typename WrapType, typename PropType = DualPropDesc<WrapType>, int COUNT>  \
static inline std::vector<PropType>& cls_exports(WrapType* uniqtype, UniqTag<COUNT>)  \
{  \
/*ONRET(debug("(skipping cls_export[%d])", COUNT))*/; /*put after callee for clearer debug*/  \
    return cls_exports(/*NULL_OF(WrapType)*/uniqtype, UniqTag<COUNT - 1> {}); /*include base class exports*/  \
}  \
CONSTDEF(THISLINE(cls_count), saved, GET_COUNTER_POSTINC(num_class_exports));  \
template<typename WrapType, typename PropType = DualPropDesc<WrapType>>  \
inline static std::vector<PropType>& cls_exports(WrapType* uniqtype, UniqTag<THISLINE(cls_count)::saved>)  \
{  \
/*ONRET(debug("inh cls_export<%d>[%d] '%s'", THISLINE(cls_count)::saved, base::cls_exports(NULL_OF(WrapType)).size(), #cls))*/; /*put after callee for clearer debug*/  \
    static std::vector<PropType> empty;  \
    /*if (#cls == #base)*/ return empty;  \
    return /*base::*/cls_exports(/*NULL_OF(WrapType)*/uniqtype /*UniqTag<base::last_cls_export::count> {}*/);  \
}
#endif


//collect scattered prop defs into a vector:
//use Napi::ClassPropertyDescriptor<WRAPPED_CLASS> for wrapped classes, Napi::PropertyDescriptor for wrapped object instances
template<typename CLS, typename cls_propdesc_type = Napi::ClassPropertyDescriptor<CLS>> //, EXPCLS = ExportedClass<CLS>>
std::vector<cls_propdesc_type> collect_exports(int which)
{
    const auto& napi_dual_exports = CLS::cls_exports(NULL_OF(CLS)); //, UniqTag<counter> {}); 
    std::vector<cls_propdesc_type> /*decltype(collect_exports(0))*/ napi_exports;
//    using napprop = napi_property_descriptor; //reduce verbosity
    for (auto it = napi_dual_exports.begin(); it != napi_dual_exports.end(); ++it)
        switch (which)
        {
            case 1: //class prop defs
                if (((napi_property_descriptor)it->first).getter || ((napi_property_descriptor)it->first).method)
                    napi_exports.push_back(it->first); //*it.first);
                break;
            case 2: //obj (inst) prop defs
                if (((napi_property_descriptor)it->second).getter || ((napi_property_descriptor)it->second).method)
                    throw "BROKEN"; //napi_exports.push_back(it->second); //*it.second);
                break;
        }
    return napi_exports;
}


//define class export list:
//top of export chain (empty)
//class NoBaseClass
//{
//    NAPI_START_EXPORTS(NoBaseClass);
//};
#if 0 //no longer needed
class xNoBaseClass
{
    using cls = xNoBaseClass;
public:
//define empty export list:
    template<typename WrapType, typename PropType = DualPropDesc<WrapType>>
    inline static std::vector<PropType>& cls_exports(WrapType* uniqtype) //, UniqTag<0>)
    {
        static std::vector<PropType> empty;
        return empty;
    }
//allow singleton redirect:
    template <typename ... ARGS>
    inline static cls*& singleton(ARGS&& ... args)
    {
        static cls* m_singleton = new cls(std::forward<ARGS>(args) ...); /*first time only; CAUTION: override base singleton also*/
//        debug("NoBaseClass" " singleton@ %#p", m_singleton);
        return m_singleton;
    }
};
#endif //0


//reduce verbosity:
#define NapProp  Napi::PropertyDescriptor
#define InstanceGetterCB  InstanceGetterCallback
#define InstanceSetterCB  InstanceSetterCallback
#define InstanceMethodCB  InstanceMethodCallback
#define GetterCB  GetterCallback
#define SetterCB  SetterCallback
#define MethodCB  MethodCallback

//try to make names more consistent for easier token pasting:
//InstanceMethodCallback
//InstanceGetterCallback  InstanceAccessor
//InstanceSetterCallback  InstanceMethod
#define InstanceAccessorGetterCallback  InstanceGetterCB
#define InstanceAccessorSetterCallback  InstanceSetterCB
#define InstanceMethodGetterCallback  InstanceMethodCB
#define InstanceMethodSetterCallback  InstanceSetterCB //unused for methods
#define InstanceMethod_shim(name, func, ignore, attrs)  InstanceMethod(name, func, attrs)
#define InstanceAccessor_shim(name, getter, setter, attrs)  InstanceAccessor(name, getter, setter, attrs)

//namespace Napi {
//struct my_PropertyDescriptor: PropertyDescriptor {
typedef Napi::Value (*MethodCallback)(const Napi::CallbackInfo& info); //Napi::Callable
//#define PropertyDescriptor  my_PropertyDescriptor //override Napi def

#define ObjectAccessorGetterCallback  NapProp::GetterCB
#define ObjectAccessorSetterCallback  NapProp::SetterCB
#define ObjectMethodGetterCallback  /*PropertyDescriptor::*/MethodCB
#define ObjectMethodSetterCallback  NapProp::SetterCB //unused for methods
#define ObjectMethod_shim(name, func, ignore, attrs)  NapProp::Function(name, func, attrs)
#define ObjectAccessor_shim(name, getter, setter, attrs)  NapProp::Accessor(name, getter, setter, attrs)


//getter helpers:
//kludge: can't get std::enable_if<> to work :( use overloaded functions instead
//overload to add more data types as needed
//CAUTION: to prevent casting bool, float, etc to int, need to explicitly overload them below
//http://www.gockelhut.com/cpp-pirate/disable-implicit-casts.html
template <typename T>
inline Napi::Value val2napi(const Napi::Env& env, T val) = delete;
//broken- kludge: define custom types to prevent implicit type casting (float, msec_t are ambiguous)
//https://stackoverflow.com/questions/25809476/how-to-stop-automatic-conversion-from-int-to-float-and-vice-versa-in-stdmap
//struct intval { typedef int type; };
//struct boolval { typedef bool type; };
//struct floatval { typedef float type; };
//struct doubleval { typedef double type; };
//struct unsintval { typedef unsigned int type; };
//struct strval { typedef const char* type; };
inline Napi::Value val2napi(const Napi::Env& env, int n) //, const char* which)
{
//debug("%s val2napi(int) %d", which, n);
    return Napi::Number::New(env, n);
}
#if 1
inline Napi::Value val2napi(const Napi::Env& env, bool n) //, const char* which)
{
//debug("%s val2napi(bool) %d", which, n);
    return Napi::Number::New(env, n);
}
#ifndef __arm__ //not needed on RPi
inline Napi::Value val2napi(const Napi::Env& env, unsigned int n) //, const char* which)
{
//debug("%s val2napi(uns int) %u", which, n);
    return Napi::Number::New(env, n);
}
#endif //__arm__
inline Napi::Value val2napi(const Napi::Env& env, size_t n) //, const char* which)
{
//long unsigned int
//debug("%s val2napi(uns int) %lu", which, n);
    return Napi::Number::New(env, n);
}
//inline Napi::Value val2napi(const Napi::Env& env, msec_t n) //, const char* which)
//{
//debug("val2napi(msec_t) %s", which);
//    return Napi::Number::New(env, n);
//}
inline Napi::Value val2napi(const Napi::Env& env, float n) //, const char* which)
{
//debug("%s val2napi(float) %f", which, n);
    return Napi::Number::New(env, n);
}
//inline Napi::Value x_val2napi(const Napi::Env& env, double n) //, const char* which)
//{
//debug("val2napi(double) %s", which);
//    return Napi::Number::New(env, n);
//}
#endif //1
inline Napi::Value val2napi(const Napi::Env& env, const char* s) //, const char* which)
{
//debug("%s val2napi(str) %d:'%s'", which, strlen(nvl(s)), nvl(s));
    return Napi::String::New(env, s);
}


//generate napi getter wrapper:
//generate a class (instance) wrapper and an object (static) wrapper, let caller choose later
#if 1
#define NAPI_GETTER(...)  UPTO_3ARGS(__VA_ARGS__, NAPI_GETTER_3ARGS, NAPI_GETTER_2ARGS, missing_args) (__VA_ARGS__)
#define NAPI_GETTER_2ARGS(cls, getter)  NAPI_GETTER_3ARGS(cls, getter, THISLINE(cls_getter_napi))
#define NAPI_GETTER_3ARGS(cls, getter, wrapper_name)  \
inline Napi::Value wrapper_name(const Napi::CallbackInfo& info)  \
{  \
    /*auto svgetter(getter);*/  \
    return val2napi(info.Env(), getter()/*, #cls ":" #getter*/);  \
}  \
static inline Napi::Value THISLINE(obj_getter_napi)(const Napi::CallbackInfo& info)  \
{  \
    return val2napi(info.Env(), cls::singleton()->getter()/*, "singleton:" #cls ":" #getter*/);  \
}
//no worky: ENABLEIF(std::is_function<decltype(cls::singleton())>::value)

#else //no worky :(
//add other data types as needed
#define NAPI_GETTER(cls, getter)  \
using THISLINE(getter_type) = decltype(/*std::result_of<*/NULL_OF(cls)->getter())/*>::type*/;  \
ENABLEIF(std::is_arithmetic<THISLINE(getter_type)>::value /*|| std::is_same<THISLINE(getter_type), FB::time_t>::value*/)  \
Napi::Value THISLINE(getter_napi)(const Napi::CallbackInfo& info) { return Napi::Number::New(info.Env(), getter()); }  \
ENABLEIF(std::is_string<THISLINE(getter_type)>::value)  \
Napi::Value THISLINE(getter_napi)(const Napi::CallbackInfo& info) { return Napi::String::New(info.Env(), "getter()"); }
#define noworky \
Napi::Value THISLINE(getter_napi)(const Napi::CallbackInfo& info)  \
{  \
    if (std::is_arithmetic<THISLINE(getter_type)>::value)  \
        return Napi::Number::New(info.Env(), getter());  \
    if (std::is_string<THISLINE(getter_type)>::value)  \
        return Napi::String::New(info.Env(), getter());  \
}
#endif //0


//setter helpers:
//kludge: overload parameter list to allow different ret types
//caller must supply getter ret type; can be multiple overloaded setters but only 1 getter
//getter is unique, setter might be overloaded; use getter ret type to choose setter data type
//overload to add more data types as needed
//NOTE: `To*` methods do type coercion; the `As()` method does not.
template<typename T>
inline T napi2val(const Napi::Value& value) //, const char* which)
{
    err_napi(value.Env(), "unhandled napi type: %s", NapiValue2str(value));
//debug("napi2val<undef> %s", which);
    return 0; //unknown data type; just use 0
}
template<>
inline bool napi2val<bool>(const Napi::Value& value) //, const char* which)
{
//debug("napi2val<bool> %s", which);
    return value/*.As<Napi::Number>()*/.ToBoolean().Value(); //coerce
}
template<>
inline int napi2val<int>(const Napi::Value& value) //, const char* which)
{
//debug("napi2val<int> %s", which);
    return value/*.As<Napi::Number>()*/.ToNumber().Int32Value(); //coerce
}
template<>
inline unsigned int napi2val<unsigned int>(const Napi::Value& value) //, const char* which)
{
//debug("napi2val<int> %s", which);
    return value/*.As<Napi::Number>()*/.ToNumber().Uint32Value(); //coerce
}
template<>
inline float napi2val<float>(const Napi::Value& value) //, const char* which)
{
//debug("napi2val<float> %s", which);
    return value/*.As<Napi::Number>()*/.ToNumber().FloatValue(); //coerce
}
template<>
inline const char* napi2val<const char*>(const Napi::Value& value) //, const char* which)
{
//debug("napi2val<str> %s %s", which, NapiValue2str(value));
    static std::string str; //kludge: need persistent storage to hold string after return
    str = (std::string)value.ToString(); //coerce
    return str.c_str(); //((std::string)value/*.As<Napi::String>()*/.ToString()).c_str();
}


//generate napi setter wrapper:
//generate a class (instance) wrapper and an object (static) wrapper, let caller choose later
//?? std::result_of<getter()>::type
#if 1
#define NAPI_SETTER(...)  UPTO_4ARGS(__VA_ARGS__, NAPI_SETTER_4ARGS, NAPI_SETTER_3ARGS, missing_args, missing_args) (__VA_ARGS__)
#define NAPI_SETTER_3ARGS(cls, getter, setter)  NAPI_SETTER_4ARGS(cls, getter, setter, THISLINE(cls_setter_napi))
#define NAPI_SETTER_4ARGS(cls, getter, setter, wrapper_name)  \
using THISLINE(setter_type) = decltype(/*std::result_of<*/ /*NULL_OF(cls)->*/ std::declval<cls>().getter())/*>::type*/;  \
inline void wrapper_name(const Napi::CallbackInfo& info, const Napi::Value& value)  \
{  \
    setter(napi2val<THISLINE(setter_type)>(value/*, #cls ":" #setter*/));  \
}  \
static inline void THISLINE(obj_setter_napi)(const Napi::CallbackInfo& info/*, const Napi::Value& value*/)  \
{  \
    cls::singleton()->setter(napi2val<THISLINE(setter_type)>(info[0]/*, #cls ":" #setter*/));  \
}
//no worky ENABLEIF(std::is_function<decltype(cls::singleton())>::value)

#else //no worky :(
//add other data types as needed
#define NAPI_SETTER(cls, getter, setter)  \
using THISLINE(setter_type) = decltype(/*std::result_of<*/NULL_OF(cls)->getter())/*>::type*/;  \
ENABLEIF(std::is_integral<THISLINE(setter_type)>::value)  \
void THISLINE(setter_napi)(const Napi::CallbackInfo& info, const Napi::Value& value) { setter(value/*.As<Napi::Number>()*/.ToNumber().Int32Value()); /*return THISLINE(getter_napi)(info)*/; }  \
ENABLEIF(std::is_floating_point<THISLINE(setter_type)>::value)  \
void /*Napi::Value*/ THISLINE(setter_napi)(const Napi::CallbackInfo& info, const Napi::Value& value) { setter(value/*.As<Napi::Number>()*/.ToNumber().FloatValue()); /*return THISLINE(getter_napi)(info)*/; }  \
ENABLEIF(std::is_string<THISLINE(setter_type)>::value)  \
void THISLINE(setter_napi)(const Napi::CallbackInfo& info, const Napi::Value& value) { setter(((std::string)value/*.As<Napi::String>()*/.ToString()).c_str()); }
#endif //0


#if 0 //no worky
//#define IGNORE(thing)  //cls name !needed if macro used within cls
#define NAPI_PROPDESC(...)  UPTO_4ARGS(__VA_ARGS__, NAPI_PROPDESC_4ARGS, NAPI_PROPDESC_3ARGS, NAPI_PROPDESC_2ARGS, missing_args) (__VA_ARGS__)
#define NAPI_PROPDESC_2ARGS(cls, name)  NAPI_PROPDESC_3ARGS(cls, name, name)
#define NAPI_PROPDESC_3ARGS(cls, name, getter)  \
NAPI_GETTER(cls, getter);  \
PropertyDescriptor name(PropertyDescriptor::Accessor<THISLINE(obj_getter_napi)>(#name))
#define NAPI_PROPDESC_4ARGS(cls, name, getter, setter)  \
NAPI_GETTER(cls, getter);  \
NAPI_SETTER(cls, getter, setter);  \
PropertyDescriptor name(PropertyDescriptor::Accessor<THISLINE(obj_getter_napi), THISLINE(cls_setter_napi)>(#name))
//add getter/setter directly to obj instance:
//NOTE: adds methods to add getter/setter; functions can't be embedded within other functions
//https://github.com/nodejs/node-addon-api/blob/master/doc/property_descriptor.md
#define NAPI_ADD_OBJPROP(...)  UPTO_4ARGS(__VA_ARGS__, NAPI_ADD_OBJPROP_4ARGS, NAPI_ADD_OBJPROP_3ARGS, NAPI_ADD_OBJPROP_2ARGS, missing_args) (__VA_ARGS__)
#define NAPI_ADD_OBJPROP_2ARGS(cls, name)  NAPI_ADD_OBJPROP_3ARGS(cls, name, name)
#define NAPI_ADD_OBJPROP_3ARGS(cls, name, getter)  \
NAPI_GETTER(cls, getter);  \
void CONCAT(add_objprop_, name)(Napi::Value obj) \
{ \
    obj.DefineProperty(PropertyDescriptor::Accessor<THISLINE(cls_getter_napi)>(#name)); \
}
#define NAPI_ADD_OBJPROP_4ARGS(cls, name, getter, setter)  \
NAPI_GETTER(cls, getter);  \
NAPI_SETTER(cls, getter, setter);  \
void CONCAT(add_objprop_, name)(Napi::Value obj) \
{ \
    obj.DefineProperty(PropertyDescriptor::Accessor<THISLINE(cls_getter_napi), THISLINE(cls_setter_napi)>(#name)); \
}
#endif


//add getter/setter/method to list of class exports:
//TODO: start new list if (derived) class does not already have one
//use VA_ARGS to allow mult params (getter, setter), or template args within "<>"
//namespace std
//{
//    template<class T, class U>
//    using is_notsame = !std::is_same<T, U>;
//};
#include <vector>
//NEW_COUNTER(num_cls_exports);
#define NAPI_ADD_EXPORT(cls, name, exptype, cls_getter, cls_setter, obj_getter, obj_setter, attrs)  \
CONSTDEF(THISLINE(cls_count), saved, GET_COUNTER_POSTINC(num_class_exports));  \
template<typename WrapType, typename PropType = DualPropDesc<WrapType>>  \
static inline std::vector<PropType>& cls_exports(WrapType* uniqtype, UniqTag<THISLINE(cls_count)::saved>)  \
{  \
    std::vector<PropType>& prevexp = cls_exports(/*NULL_OF(WrapType)*/uniqtype, UniqTag<THISLINE(cls_count)::saved - 1> {});  \
    typename WrapType::CONCAT(Instance, exptype, GetterCB) gc = (cls_getter); /* "=" here will use default ctor; won't work with lambdas so avoid "=" */ \
    typename WrapType::CONCAT(Instance, exptype, SetterCB) sc = (cls_setter); \
    /*typename Napi::*/CONCAT(Object, exptype, GetterCB) go = (obj_getter);  \
    /*typename Napi::*/CONCAT(Object, exptype, SetterCB) so = (obj_setter);  \
/*debug("adding cls_export<%d>[%d] '%s::%s' gc %#p, sc %#p, go %#p, so %#p", THISLINE(cls_count)::saved, prevexp.size(), #cls, name, gc, sc, go, so)*/;  \
    Napi::ClassPropertyDescriptor<WrapType> cls_prop = WrapType::CONCAT(Instance, exptype, _shim)(name, gc, sc, attrs);  \
    Napi::PropertyDescriptor obj_prop = /*Napi::*/CONCAT(Object, exptype, _shim)(name, go, so, attrs);  \
    prevexp.push_back(PropType(cls_prop, obj_prop));  \
    return prevexp; \
}

#if 0 //broken; needs env param
#define NAPI_EXPORT_CONST(cls, name, value)  NAPI_ADD_CONST(cls, name, value, my_napi_default_value)
#define NAPI_ADD_CONST(cls, name, value, attrs)  \
CONSTDEF(THISLINE(cls_count), saved, GET_COUNTER_POSTINC(num_class_exports));  \
template<typename WrapType, typename PropType = DualPropDesc<WrapType>>  \
static inline std::vector<PropType>& cls_exports(WrapType* uniqtype, UniqTag<THISLINE(cls_count)::saved>)  \
{  \
    std::vector<PropType>& prevexp = cls_exports(/*NULL_OF(WrapType)*/uniqtype, UniqTag<THISLINE(cls_count)::saved - 1> {});  \
    Napi::ClassPropertyDescriptor<WrapType> cls_prop = WrapType::InstanceValue(name, val2napi(value), attrs);  \
/*can't use non-static functions:    Napi::PropertyDescriptor obj_prop = Napi::PropertyDescriptor::StaticValue(name, val2napi(value), attrs);*/  \
    prevexp.push_back(PropType(cls_prop, /*obj_prop*/ nullptr));  \
    return prevexp; \
}
#endif

//allow caller to see and/or overwrite props and methods:
//(use for subclassing/customizing)
//hmmm, looks like we must choose between them?
#define my_napi_default_prop  napi_enumerable //(napi_enumerable | napi_writable) //napi_default
#define my_napi_default_method  napi_writable //(napi_enumerable | napi_writable) //napi_default
#define my_napi_default_value  napi_enumerable //(napi_enumerable | napi_writable) //napi_default

//variants for instance propery:
#define NAPI_EXPORT_PROPERTY(...)  UPTO_5ARGS(__VA_ARGS__, NAPI_EXPORT_PROPERTY_5ARGS, NAPI_EXPORT_PROPERTY_4ARGS, NAPI_EXPORT_PROPERTY_3ARGS, NAPI_EXPORT_PROPERTY_2ARGS, missing_args) (__VA_ARGS__)
#define NAPI_EXPORT_PROPERTY_2ARGS(cls, getter)  NAPI_EXPORT_PROPERTY_3ARGS(cls, #getter, getter)
#define NAPI_EXPORT_PROPERTY_3ARGS(cls, name, getter)  \
NAPI_GETTER(cls, getter);  \
NAPI_ADD_EXPORT(cls, name, Accessor, &WrapType::THISLINE(cls_getter_napi), nullptr, &THISLINE(obj_getter_napi), nullptr, my_napi_default_prop)
//#define NAPI_EXPORT_PROPERTY_3ARGS(cls, getter, setter)  NAPI_EXPORT_PROPERTY_4ARGS(cls, #getter, getter, setter)
#define NAPI_EXPORT_PROPERTY_4ARGS(cls, name, getter, setter)  NAPI_EXPORT_PROPERTY_5ARGS(cls, name, getter, setter, my_napi_default_prop)
#define NAPI_EXPORT_PROPERTY_5ARGS(cls, name, getter, setter, attrs)  \
NAPI_GETTER(cls, getter);  \
NAPI_SETTER(cls, getter, setter);  \
NAPI_ADD_EXPORT(cls, name, Accessor, &WrapType::THISLINE(cls_getter_napi), &WrapType::THISLINE(cls_setter_napi), &THISLINE(obj_getter_napi), &THISLINE(obj_setter_napi), attrs)

//#define NAPI_EXPORT_WRAPPED_PROPERTY(...)  UPTO_5ARGS(__VA_ARGS__, NAPI_EXPORT_PROPERTY_5ARGS, NAPI_EXPORT_PROPERTY_4ARGS, NAPI_EXPORT_PROPERTY_3ARGS, NAPI_EXPORT_PROPERTY_2ARGS, missing_args) (__VA_ARGS__)
//TODO: merge with above?
//#define NAPI_EXPORT_WRAPPED_PROPERTY(...)  UPTO_4ARGS(__VA_ARGS__, NAPI_EXPORT_WRAPPED_PROPERTY_4ARGS, NAPI_EXPORT_WRAPPED_PROPERTY_3ARGS, missing_args, missing_args) (__VA_ARGS__)
//custom getter (cls only, TODO? obj):
#define NAPI_EXPORT_WRAPPED_PROPERTY(cls, name, getter)  \
NAPI_ADD_EXPORT(cls, name, Accessor, &WrapType::getter, nullptr, nullptr/*&obj_nosetter_napi*/, nullptr, my_napi_default_prop)
//custom getter, generic setter (cls only, TODO? obj):
#define NAPI_EXPORT_WRAPPED_PROPERTY_WITH_SETTER(cls, name, getter, getter_type, setter)  \
NAPI_SETTER(cls, getter_type, setter);  \
NAPI_ADD_EXPORT(cls, name, Accessor, &WrapType::getter, &WrapType::THISLINE(cls_setter_napi), nullptr/*&obj_nosetter_napi*/, nullptr, my_napi_default_prop)

#pragma message(YELLOW_MSG "TODO: EXPORT_CONST without getter wrapper")


//variants for instance method:
//caller must supply custom wrapper (typically requires parameter handling)
//custom method might be member, static, or both
#define NAPI_EXPORT_METHOD(...)  UPTO_5ARGS(__VA_ARGS__, NAPI_EXPORT_METHOD_5ARGS, NAPI_EXPORT_METHOD_4ARGS, NAPI_EXPORT_METHOD_3ARGS, NAPI_EXPORT_METHOD_2ARGS, missing_args) (__VA_ARGS__)
#define NAPI_EXPORT_METHOD_2ARGS(cls, func)  NAPI_EXPORT_METHOD_3ARGS(cls, #func, func)
//#define NAPI_EXPORT_METHOD_3ARGS(cls, name, func)  NAPI_EXPORT_METHOD_4ARGS(cls, name, func, func) //napi_default)
#define NAPI_EXPORT_METHOD_3ARGS(cls, name, func)  NAPI_ADD_EXPORT(cls, name, Method, &WrapType::func, nullptr, nullptr, nullptr, my_napi_default_method)
#define NAPI_EXPORT_METHOD_4ARGS(cls, name, cls_func, /*attrs*/obj_func)  NAPI_EXPORT_METHOD_5ARGS(cls, name, cls_func, obj_func, my_napi_default_method)
//#define NAPI_EXPORT_METHOD_4ARGS(cls, name, func, attrs)  NAPI_EXPORT_METHOD_5ARGS(cls, name, &WrapType::func, nullptr, &func, nullptr, attrs)
#define NAPI_EXPORT_METHOD_5ARGS(cls, name, cls_func, obj_func, attrs)  NAPI_ADD_EXPORT(cls, name, Method, &WrapType::cls_func, nullptr, &obj_func, nullptr, attrs)


#if 0 //not needed
//define instance property:
//TODO: auto-add prop desc?  caller has more control doing it explicitly; prop descs must be declared outside functions
#define NAPI_PROPDEF(...)  UPTO_5ARGS(__VA_ARGS__, NAPI_PROPDEF_5ARGS, NAPI_PROPDEF_4ARGS, NAPI_PROPDEF_3ARGS, NAPI_PROPDEF_2ARGS, missing_args) (__VA_ARGS__)
#define NAPI_PROPDEF_2ARGS(obj, name)  NAPI_PROPDEF_4ARGS(obj, #name, name)
#define NAPI_PROPDEF_3ARGS(obj, name, getter)  \
NAPI_GETTER(cls_ignored, getter);  \
/*obj.DefineProperty(*/ PropertyDescriptor obj = PropertyDescriptor::Accessor<&WrapType::THISLINE(cls_getter_napi)>(name)
#define NAPI_PROPDEF_4ARGS(obj, name, getter, setter)  NAPI_PROPDEF_5ARGS(obj, name, getter, setter, my_napi_default_prop)
#define NAPI_PROPDEF_5ARGS(obj, name, getter, setter, attrs)  \
NAPI_GETTER(cls_ignored, getter);  \
NAPI_SETTER(cls_ignored, getter, setter);  \
using THISLINE(setter_type) = decltype(/*std::result_of<*/ /*NULL_OF(cls)->*/ std::declval<cls>().getter())/*>::type*/;  \
inline void wrapper_name(const Napi::CallbackInfo& info, const Napi::Value& value)  \
{  \
    setter(napi2val<THISLINE(setter_type)>(value/*, #cls ":" #setter*/));  \
}
/*obj.DefineProperty(*/ PropertyDescriptor obj = PropertyDescriptor::Accessor<&WrapType::THISLINE(cls_getter_napi), &WrapType::THISLINE(cls_setter_napi)>(name, attrs)
#endif //0


#if 1 //TODO: merge with NAPI_ADD_EXPORT
//finalize export list:
//must be public for other classes to access
//kludge: create an additional (empty) export that is public in case previous exports are not
//don't need sequential/unique tag on final export list
//    CONSTDEF(last_cls_export, count, GET_COUNTER_POSTINC(num_class_exports) /*- 1*/); 
//        return cls_exports<PropDesc>(UniqTag<last_cls_export::count - 1> {}); 
#define NAPI_STOP_EXPORTS(cls)  \
CONSTDEF(THISLINE(cls_count), saved, GET_COUNTER_POSTINC(num_class_exports));  \
public:  \
template<typename WrapType, typename PropType = DualPropDesc<WrapType>>  \
inline static std::vector<PropType>& cls_exports(/*UniqTag<last_cls_export::count>*/ WrapType* dummy)  \
{  \
    return cls_exports(NULL_OF(WrapType), UniqTag<THISLINE(cls_count)::saved - 1> {});  \
}
//template<int = 0>  \
//inline static cls& singleton() { return *NULL_OF(cls); }
#endif //1


//async worker:
//async callback examples: https://nodejs.org/api/n-api.html#n_api_simple_asynchronous_operations
//https://github.com/nodejs/node-addon-examples/issues/85
//https://github.com/nodejs/node-addon-api/blob/master/doc/promises.md
template<class LAMBDA_T, typename RETVAL_T>
class my_AsyncWker: public Napi::AsyncWorker
{
//protected:
//    FBPixels& m_fbpx;
//    DATA_T& m_data;
    LAMBDA_T m_lambda; //lambda can capture data ptr to "this" if needed
//    using RETVAL_T = typename decltype(m_lambda());
    /*bool*/ RETVAL_T m_retval;
    Napi::Promise::Deferred/*&*/ m_defer; //causes dangling-pointer if referred object is local/temporary in caller of constructor??
public: //ctor/dtor
//??    my_AsyncWker(const Napi::Env& env, Napi::Promise::Deferred& def, DATA_T& data): AsyncWorker(env), m_def(def), m_data(data) { Queue(); }
    my_AsyncWker(const Napi::Env& env, /*data_t* data,*/ LAMBDA_T lambda): Napi::AsyncWorker(env), m_defer(Napi::Promise::Deferred::New(env)), m_lambda(lambda) { Queue(); }  //enqueue is next step, so just do it here
    ~my_AsyncWker() {}
public: //methods
    Napi::Promise GetPromise() { return m_defer.Promise(); }
//    static Napi::Promise& PromiseToWork()
//    {
//            my_AsyncWker* wker = new my_AsyncWker(info.Env(), this); //this->fbpx);
////        auto promise = wker->GetPromise();
//        wker->Queue();
//        return wker->GetPromise();
//    }
    void Execute() //CAUTION: executes on different thread; must not access NAPI data
    {
        m_retval = m_lambda(); //m_data.method();
//simpler just to return errors to cb than raise error; cb also then fits promises
//            std::string errmsg = "method failed";
//            if (!retval) Napi::AsyncWorker::SetError(errmsg);
    }
    template <typename T = RETVAL_T>
    typename std::enable_if<std::is_same<T, Napi::Value>::value, void>::type OnOK() { m_defer.Resolve(m_retval); } //NOTE: called on main Node.js event loop, not worker thread; safe to use napi data
    template <typename T = RETVAL_T>
    typename std::enable_if<!std::is_same<T, Napi::Value>::value, void>::type OnOK() { m_defer.Resolve(Napi::Number::New(/*env*/ Env(), m_retval)); } //NOTE: called on main Node.js event loop, not worker thread; safe to use napi data
//??        void OnError(Napi::Error const &error) { m_def.Reject(error.Value()); }
};

//async execution:
//lambda function creates in-line stack frame with captured args; nice!
//capture var args into struct:
//template <typename ... ARGS>
//std::forward<ARGS>(args) ...
//    struct capture{__VA_ARGS__};
//    LASTARG(VA_ARGS) retval = CONCAT(exec_, 1017)(DROPLAST(VA_ARGS));
//struct capture { ARGS&& value; }; //capture {std::forward<ARGS>(value) ...};
#define NAPI_ASYNC_RETURN(async_exec)  \
    using lambda_t = decltype(async_exec);  \
    using retval_t = typename std::remove_cvref<decltype(async_exec())>::type;  \
    return (new my_AsyncWker<lambda_t, retval_t>(info.Env(), async_exec))->GetPromise()
//    my_AsyncWker* wker = new my_AsyncWker(info.Env(), async_exec);
//    return wker->GetPromise()


#include <map> //std::map<>
std::map<const char*, Napi::FunctionReference*> ctors;


//wrap C++ class and export to napi:
//NOTE: don't ObjectWrap<> base classes, just final derived classes
//    struct Getter { typedef Napi::Value (OTHER::*type)(const Napi::CallbackInfo& info); };
//    struct Setter { typedef void (OTHER::*type)(const Napi::CallbackInfo& info, const Napi::Value& value); };
//struct B { virtual void foo() = 0; };
//struct D : B {  void foo() override { }  };
//    void (B::*ptr)() = &D::foo; // error:
//void (B::*ptr)() =   static_cast<void (B::*)()>(&D::foo); // ok!
//https://stackoverflow.com/questions/31601217/cast-a-pointer-to-member-function-in-derived-class-to-a-pointer-to-abstract-memb?rq=1
//?? static T* Napi::ObjectWrap::Unwrap(Napi::Object wrapper);
//https://github.com/nodejs/node-addon-api/blob/master/doc/object_wrap.md
template <class CLS> //, class CLSWRAP = CustomWrapper<CLS>> //, int COUNTER>
class ExportedClass: public CLS/*WRAP*/, public Napi::ObjectWrap<ExportedClass<CLS>> //, COUNTER>>
{
    using THIS = ExportedClass<CLS>; //, COUNTER>;
    using SUPER = Napi::ObjectWrap<THIS>;
//    CLS& target; //use containment to allow custom (shared) memory mgmt
public:
    static const char* classname; //kludge: string template parameters not supported :(
//    using basecls_exports = typename CLS::cls_exports<totype>;
//    using totype = Napi::ClassPropertyDescriptor<Napi::ObjectWrap<Exported<CLS>>>;
//    typedef Napi::ClassPropertyDescriptor<Exported<CLS>> totype;
//    template<typename PropDesc>
//    inline static std::vector<PropDesc>& basecls_exports(PropDesc* dummy)
//    {
//        return CLS::cls_exports<PropDesc>();
////        return CLS::cls_exports<PropDesc>(UniqTag<CLS::last_cls_export::count> {});
//    }
public:
//CLS should handle NAPI ctor args
    ExportedClass(const Napi::CallbackInfo& args): /*target(*new /*(args)*/ CLS(args), SUPER(args) {} //pass args to placement new as well as ctor?
//Napi::ObjectWrap<Exported<CLS, COUNTER>>(args) { /*debug(TOSTR(cls) " wrap@ %p ctor", this)*/; }
//    {
//        if (args.Length()) warn("%s napi ctor @%p: %d args !implemented", this, args.Length());
//        warn("%s napi ctor: wrap @%p, %d args: %s ...", classname, this, args.Length(), NapiArgType(args, 0));
//    }
    ~ExportedClass() {} //warn("%s napi dtor: wrap@ %p", classname, this); } //if (&target) delete &target; }
//static helpers:
public:
//    static inline std::vector<DualPropDesc<THIS>>& cls_exports(THIS* dummy) //shim: copy CLS exports to THIS
//    {
//        return CLS::cls_exports(dummy);
//    }
    static Napi::Object Export(Napi::Env env, Napi::Object exports)
    {
//        using totype = Napi::ClassPropertyDescriptor<Exported<CLS>>;
//        using totype = Exported; //<CLS, COUNTER>; //Napi::ClassPropertyDescriptor<Exported<CLS>>;
//        using totype2 = Napi::ClassPropertyDescriptor<Exported<CLS>>;
//        using totype = Napi::ClassPropertyDescriptor<Exported<CLS>>;
//use template deduction to cast member getter/setter/function pointers to correct type:
#if 1
        const auto& napi_dual_exports = THIS::cls_exports(NULL_OF(THIS)); //, UniqTag<counter> {}); //UniqTag<CLS::last_cls_export::count> {}); //NOTE: g++ class name qualifier here :(
//strip off instance props, keep class props:
        std::vector<Napi::ClassPropertyDescriptor<THIS>> napi_exports;
        using napprop = napi_property_descriptor; //reduce verbosity
        for (auto it = napi_dual_exports.begin(); it != napi_dual_exports.end(); ++it)
            if (((napprop)it->first).getter || ((napprop)it->first).method)
                napi_exports.push_back(it->first); //*it.first);
//debug("%s export %'lu -> %'lu class getters/setters/methods", classname, napi_dual_exports.size(), napi_exports.size()); //, cls::last_cls_export::count);
#else
        /*std::vector<Napi::ClassPropertyDescriptor<THIS>>*/ auto napi_exports = collect_exports<THIS>(1);
#endif
        Napi::Function clsdef = THIS::DefineClass(env, classname, napi_exports); //??, new WS281x());
#if 1
        Napi::FunctionReference* ctor = new Napi::FunctionReference();
        *ctor = Napi::Persistent(clsdef);
//debug("napi ctor for %s: %p", classname, ctor);
//        ctor->SuppressDestruct(); //??
//        env.SetInstanceData(ctor); //??
//        auto found = ctors.find(classname);
//        line_elapsed_t retval = (found != latest.end())? now - found->second: 999e3; //now;
        ctors[classname] = ctor;
        env.SetInstanceData<Napi::FunctionReference>(ctor); //NOTE: only stores latest
//https://github.com/nodejs/node-addon-api/blob/master/doc/object_wrap.md
#else //BROKEN- CAUTION: ctor must be static (on heap), else core dump
        static Napi::FunctionReference ctor = Napi::Persistent(clsdef);
//        ctor.SuppressDestruct(); //only needed if obj cre in static space (ie, global static instance); prevents dtor trying to reset ref after env no longer valid
        env.SetInstanceData(&ctor); //broken/not useful; overwrites other ctors
#endif //1
//        exports = module_exports(env, exports); //incl prev export(s)
        exports.Set(classname, clsdef); //add new export(s)
        return exports;
    }
//https://github.com/nodejs/node-addon-api/blob/master/doc/object_wrap.md
//    Napi::Value Example::CreateNewItem(const Napi::CallbackInfo& info)
//    static const std::vector<napi_value> no_args;
    static Napi::Object NewInstance(Napi::Env env)
    {
        static const std::vector<napi_value> no_args;
        return NewInstance(env, no_args);
    }
//    static Napi::FunctionReference* get_ctor(Napi::Env env)
//    {
//        return env.GetInstanceData<Napi::FunctionReference>();
//    }
    static Napi::Object NewInstance(Napi::Env env, const std::vector<napi_value>& args) //= no_args) //const Napi::CallbackInfo& info) //Napi::Value args)
    {
//for cre JS obj within C, see https://github.com/nodejs/node-addon-examples/tree/master/8_passing_wrapped/node-addon-api
//instantiate new obj using ctor defined above (stored in instance data):
//        return ExportedClass::Info.Env().GetInstanceData<Napi::FunctionReference>()->New(args);
//debug("napi %s get ctor", classname);
        Napi::FunctionReference* ctor = /*info.Env()*/env.GetInstanceData<Napi::FunctionReference>();
//        Napi::FunctionReference* ctor_sel = ctors[classname];
        auto found = ctors.find(classname);
        Napi::FunctionReference* ctor_fix = (found != ctors.end())? found->second: 0;
//        return ctor->New(args); //Napi::Number::New(info.Env(), 42) });
//debug("napi call %s ctor %p vs %p", classname, ctor, ctor_fix);
        auto retval = ctor_fix->New(args); //Napi::Number::New(info.Env(), 42) });
//debug("napi got %s new inst", classname);
        return retval;
//ExportedClass<frbuf_t>::Info.Env().GetInstanceData<Napi::FunctionReference>()->New(); //{arg});
    }
};
//template<> const std::vector<napi_value> ExportedClass<shmdata_t::frbuf_t::port_t>::no_args;

#define NAPI_EXPORT_CLASS(...)  UPTO_2ARGS(__VA_ARGS__, NAPI_EXPORT_CLASS_2ARGS, NAPI_EXPORT_CLASS_1ARG) (__VA_ARGS__)
#define NAPI_EXPORT_CLASS_1ARG(cls)  NAPI_EXPORT_CLASS_2ARGS(cls, #cls)
#define NAPI_EXPORT_CLASS_2ARGS(cls, clsname)  \
template<>  const char* ExportedClass<cls>::classname = clsname;  \
NAPI_EXPORT_MODULE(ExportedClass<cls>::Export) // /*Exported<cls>::Init*/ cls, THISLINE(cls_count)::saved)


//export object (singleton):
//don't use ObjectWrap<>; just copy object properties/methods to exported object
template <class CLS> //, int COUNTER>
class ExportedObject
{
    using EXPCLS = ExportedClass<CLS>; //, COUNTER>;
    static const char* objname;
    static CLS& object; //assumes singleton, but caller can make unique with CLS template arg
public:
    static Napi::Object Export(Napi::Env env, Napi::Object exports)
    {
#if 0
//        const auto& napi_exports = THIS::cls_exports(NULL_OF(THIS));
        const auto& napi_dual_exports = EXPCLS::cls_exports(NULL_OF(EXPCLS)); //, UniqTag<counter> {}); //UniqTag<CLS::last_cls_export::count> {}); //NOTE: g++ class name qualifier here :(
//strip off class props, keep instance props:
        std::vector<Napi::PropertyDescriptor> napi_exports;
        using napprop = napi_property_descriptor; //reduce verbosity
        for (auto it = napi_dual_exports.begin(); it != napi_dual_exports.end(); ++it)
            if (((napprop)it->second).getter || ((napprop)it->second).method)
                napi_exports.push_back(it->second);
#else
        std::vector<Napi::PropertyDescriptor> BROKEN;
        /*std::vector<Napi::PropertyDescriptor>*/ auto napi_exports = collect_exports<EXPCLS/*, Napi::PropertyDescriptor*/>(2);
#endif
//debug("%s export %'lu -> %'lu object getters/setters/methods", objname, napi_dual_exports.size(), napi_exports.size());
        Napi::Object expobj = Napi::Object::New(env);
//see https://github.com/nodejs/node-addon-api/blob/master/doc/property_descriptor.md
        expobj.DefineProperties(napi_exports);
        exports.Set(objname, expobj); //add exported obj
        return exports;
    }
};

#define NAPI_EXPORT_OBJECT(...)  UPTO_2ARGS(__VA_ARGS__, NAPI_EXPORT_OBJECT_2ARGS, NAPI_EXPORT_OBJECT_1ARG) (__VA_ARGS__)
#define NAPI_EXPORT_OBJECT_1ARG(obj)  NAPI_EXPORT_OBJECT_2ARGS(obj, #obj)
#define NAPI_EXPORT_OBJECT_2ARGS(obj, name)  \
using THISLINE(objcls) = std::remove_cvref<decltype(obj)>::type;  \
template<> const char* ExportedObject<THISLINE(objcls)>::objname = name;  \
template<> THISLINE(objcls)& ExportedObject<THISLINE(objcls)>::object = obj;  \
NAPI_EXPORT_MODULE(ExportedObject<THISLINE(objcls)>::Export)


//test/example objects + napi instrumentation:
#ifdef WANT_EXAMPLES
#pragma message("compiled with example/demo napi classes")
//class CHILD;
//template<> class Exported<CHILD, 4>; //fwd ref

class CHILD
{
//using THIS = CHILD;
//    using __CLASS__ = CHILD; //in lieu of built-in g++ macro
    NAPI_START_EXPORTS(CHILD);
protected: //allow PARENT to access
    int m_x;
    float m_y;
    const char* m_str;
public: //ctors/dtors
#if 0 //def NAPI_EXPORT_CLASS //ctor needs to accept napi args if exported
    CHILD(const Napi::CallbackInfo& args)
    {
//        debug("child ctor got %d args", args.Length());
        for (int i = 0; i < args.Length(); ++i)
            debug("child ctor arg[%d/%d]: %s", i, args.Length(), NapiValue2str(args[i]));
    }
#endif
    CHILD() { debug("CHILD@ %#p ctor", this); }
    ~CHILD() { debug("CHILD@ %#p dtor", this); }
//no    napi_CHILD(const Napi::CallbackInfo& args): Napi::ObjectWrap<napi_CHILD>(args) {}
//public:
    int x() { return m_x; }
    NAPI_EXPORT_PROPERTY(CHILD, x);
    float gety() { return m_y; }
    void sety(float newy) { m_y = newy; }
    NAPI_EXPORT_PROPERTY(CHILD, "y", gety, sety);
    const char* str() { return m_str; }
    void str(const char* newstr) { m_str = newstr; }
    NAPI_EXPORT_PROPERTY(CHILD, str, str);
//public: //napi helpers
//exports:
    NAPI_STOP_EXPORTS(CHILD); //public
};
NAPI_EXPORT_CLASS(CHILD);


class PARENT: public CHILD
{
    NAPI_START_EXPORTS(PARENT, CHILD);
    int m_z, m_y;
public: //ctors/dtors
    PARENT(): CHILD() { debug("PARENT@ %#p ctor", this); } //Class_HAVING_EXPORTS(CHILD)() {}
    ~PARENT() { debug("PARENT@ %#p dtor", this); }
public:
    float gety() { return 2 * m_y; }
    void sety(float newy) { m_y = 2 * newy; }
    NAPI_EXPORT_PROPERTY(PARENT, "y", gety, sety); //override child
    int getz() { return m_z; }
    void setz(int newz) { m_z = newz; }
    NAPI_EXPORT_PROPERTY(PARENT, "z", getz, setz);
#ifdef USING_NAPI
    Napi::Value async_method(const Napi::CallbackInfo& info)
    {
debug("async method: #args %d, arg[0] %s", info.Length(), NapiType(info[0]));
        if ((info.Length() < 1) || !info[0].IsNumber()) return err_napi(info.Env(), "milliseconds (Number) expected");
//        const auto delay_msec = info[0].As<Napi::Number>().Int32Value();
        int delay_msec = info[0].As<Napi::Number>().Int32Value();
//        float x;
        m_x = 1234;
//#define WITHTYPE(x)  decltype(x) x
//https://web.mst.edu/~nmjxv3/articles/lambdas.html
//https://stackoverflow.com/questions/7627098/what-is-a-lambda-expression-in-c11
        auto async_exec = [this, delay_msec](/*WITHTYPE(this), WITHTYPE(delay_msec), WITHTYPE(x)*/) -> float
        {
debug("async_exec: this %#p, delay %d, x = %d", this, delay_msec, x());
            usleep(delay_msec * 1e3);
    //    float x = 1.23;
            float retval = x() / 10.0;
            m_x = 4567;
            printf("async lamba %f, z %f\n", retval, getz());
            return retval; //1.234;
        };
//        async_exec();
//        return Napi::Number::New(info.Env(), 0);
        NAPI_ASYNC_RETURN(async_exec); //delay_msec, x, float) //-> rettype
    }
    NAPI_EXPORT_METHOD(PARENT, "async", async_method);
#endif //def USING_NAPI
//public: //napi helpers
//exports:
    NAPI_STOP_EXPORTS(PARENT); //public
};
NAPI_EXPORT_CLASS(PARENT);
#endif //def WANT_EXAMPLES

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

#endif //ndef _NAPI_HELPERS
//eof