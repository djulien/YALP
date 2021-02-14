//no longer used

//#include <type_traits> //std::remove_cvref<>, std::decay<>, std::remove_reference<>, std::remove_pointer<>, std::conditional<>, std::if_same<>, std::is_arithmetic<>, enable_if<>, is_same<>, const_cast<>, result_of<>, std::is_function<>

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


//reduce verbosity of conditional compiles:
//requires template reduction and SFINAE
#if 0
 #define IFTYPE(expr, istype, usetype)  \
 template<typename T = usetype>  \
 typename std::enable_if<std::is_same<decltype(expr), istype>::value, T>::type
//typename std::enable_if<std::is_same<std::remove_cvref<decltype(expr)>::type, istype>::value, T>::type
 #define IFNUMERIC(expr, usetype)  \
 template<typename T = usetype>  \
 typename std::enable_if<std::is_arithmetic<decltype(expr)>::value, T>::type
//typename std::enable_if<std::is_arithmetic<std::remove_cvref<decltype(expr)>::type>::value, T>::type
#elif 0
//template <class T>
//typename std::enable_if<std::is_integral<T>::value,bool>::type
//template<class T>
//struct is_arithmetic : std::integral_constant < bool, is_integral<T>::value || is_floating_point<T>::value > {};
 #define ENABLEIF(...)  UPTO_4ARGS(__VA_ARGS__, ENABLEIF_4ARGS, ENABLEIF_3ARGS, missing_args, missing_args) (__VA_ARGS__)
 #define ENABLEIF_3ARGS(test, expr, usetype)  \
 template<typename T = decltype(expr)>  \
 typename std::enable_if<std::test<T>::value, usetype>::type
//template<typename T = usetype>  \
//typename std::enable_if<std::test<decltype(expr)>::value, T>::type
 #define ENABLEIF_4ARGS(test, expr, cmptype, usetype)  \
 template<typename T = decltype(expr)>  \
 typename std::enable_if<std::test<T, cmptype>::value, usetype>::type
//template<typename T = usetype>  \
//typename std::enable_if<std::test<decltype(expr), istype>::value, T>::type
#else
//based on template param technique in http://pfultz2.github.io/Tick/doc/html/requires/#tick_member_requires
 #define ENABLEIF(...) \
 template<bool TRUE = true, typename std::enable_if<(TRUE && (__VA_ARGS__)), int>::type = 0 >
#endif //0

//#define ISANY(...)  UPTO_4ARGS(__VA_ARGS__, ISANY_4ARGS, ISANY_3ARGS, ISANY_2ARGS, missing_arg) (__VA_ARGS__)
//#define ISANY_2ARGS(T, t1)  std::is_same<T, t1>::value
//#define ISANY_3ARGS(T, t1, t2)  (ISANY_2ARGS(T, t1) || ISANY_2ARGS(T, t2))
//#define ISANY_4ARGS(T, t1, t2, t3)  (ISANY_2ARGS(T, t1) || ISANY_3ARGS(T, t2, t3))


//add trait test for strings:
#if 0
namespace std
{
 //   template<class T>
 //   struct is_string: std::false_type {};
//    template<>
 //   struct is_string<const char*> : std::true_type {};
 //   template<>
 //   struct is_string<char*> : std::true_type {};
 //   template<>
 //   struct is_string<std::string> : std::true_type {};
    template<typename T>
//    struct is_string { static const bool value = false; };
//    template<>
//    struct is_string<const char*> { static const bool value = true; };
//    template<>
//    struct is_string<char*> { static const bool value = true; };
//    template<>
//    struct is_string<std::string> { static const bool value = true; };
//    struct is_string: std::integral_constant<bool, std::is_same<std::remove_cvref<T>::type, char*>::value || std::is_same<remove_cvref<T>::type, std::string>::value> {};
    struct is_string: std::integral_constant<bool, ISANY(typename std::remove_cvref<T>::type, const char*, char*, std::string)> {};
//    struct is_string { static const bool value = ISANY(std::remove_cvref<T>::type, const char*, char*, std::string); };
//    template <>
//    struct is_string<std::remove_cvref_t<const char*>> { static const bool value = true; };
//&& std::is_pointer<>
};
static_assert(std::is_string<char*>::value);
static_assert(std::is_string<const char*>::value);
static_assert(!std::is_string<int>::value);
#endif //0


//function traits:
//from https://functionalcpp.wordpress.com/2013/08/05/function-traits/
#if 0 //no worky with overloaded functions :( 
template<class FUNC>
struct function_traits;
 
// function pointer
template<class RETVAL_T, class... Args>
struct function_traits<RETVAL_T(*)(Args...)> : public function_traits<RETVAL_T(Args...)>
{};

template<class RETVAL_T, class... Args>
struct function_traits<RETVAL_T(Args...)>
{
    using return_type = RETVAL_T;
    static constexpr std::size_t arity = sizeof...(Args);
    template <std::size_t NUMARG>
    struct argument
    {
        static_assert(NUMARG < arity, RED_MSG "error: invalid parameter index");
        using type = typename std::tuple_element<NUMARG, std::tuple<Args...>>::type;
    };
};

// member function pointer
template<class CLS, class RETVAL_T, class... Args>
struct function_traits<RETVAL_T(CLS::*)(Args...)> : public function_traits<RETVAL_T(CLS&, Args...)>
{};
 
// const member function pointer
template<class CLS, class RETVAL_T, class... Args>
struct function_traits<RETVAL_T(CLS::*)(Args...) const> : public function_traits<RETVAL_T(CLS&, Args...)>
{};
 
// member object pointer
template<class CLS, class RETVAL_T>
struct function_traits<RETVAL_T(CLS::*)> : public function_traits<RETVAL_T(CLS&)>
{};

//getter (member function): -DJ
template<class CLS, class RETVAL_T>
struct function_traits<RETVAL_T(CLS::*)(void)> : public function_traits<RETVAL_T(CLS&)>
{};
//setter (member function): -DJ
template<class CLS, class Arg>
struct function_traits<void(CLS::*)(Arg)> : public function_traits<void(CLS&, Arg)>
{};

//define 
//    using Traits = function_traits<decltype(free_function)>;
//    static_assert(std::is_same<Traits::argument<0>::type,const std::string&>::value,"");
//#define ARGTYPE(...)  UPTO_2ARGS(__VA_ARGS__, ARGTYPE_2ARGS, ARGTYPE_1ARG) (__VA_ARGS__)
//#define ARGTYPE_1ARG(func)  function_traits<decltype(func)>::return_type
//#define ARGTYPE_2ARGS(func, i)  function_traits<decltype(func)>::argument<i>::type
//#define RETTYPE(func)  function_traits<decltype(func)>::return_type
//#define ARGTYPE(func, i)  function_traits<decltype(func)>::argument<i>::type

#else //simpler, works with overloads:
//check getter/setter type:
//based on https://stackoverflow.com/questions/22291737/why-cant-decltype-work-with-overloaded-functions
//#define ARGTYPES(func)  \
//template<typename... ARGS>  \
//using TestType = decltype(func(std::declval<ARGS>()...))(ARGS...)
#endif //0


#if 0
//kludge: std::is_integral doesn't seem to match time_t so fix it:
#if 0
namespace std
{
//    template<>
//    struct __is_integral_helper<decltype(time2msec()>: public true_type { };
    template<typename T>
    struct is_integral_or_time: std::integral_constant<bool, is_integral<T>::value || std::is_same<typename std::remove_cvref<T>::type, time_t>::value > {};
    template<class T>
    struct is_arithmetic_or_time: std::integral_constant<bool, is_arithmetic<T>::value || std::is_same<typename std::remove_cvref<T>::type, time_t>::value > {};
};
#define is_integral  is_integral_or_time //kludge: name conflict; use alternate
#define is_arithmetic  is_arithmetic_or_time //kludge: name conflict; use alternate

static_assert(std::is_integral<int>::value);
static_assert(std::is_integral<time_t>::value);
static_assert(!std::is_integral<const char*>::value);
static_assert(std::is_arithmetic<int>::value);
static_assert(std::is_arithmetic<time_t>::value);
static_assert(!std::is_arithmetic<const char*>::value);
#endif //0
#endif //0


//eof