#ifndef _COUNTERS_H
#define _COUNTERS_H

#include "macro-vargs.h"


//compile-time counters:
//template abuse to the max! :P
//based on template/__LINE__ trick at https://stackoverflow.com/questions/23206580/c-construct-that-behaves-like-the-counter-macro
//this is overkill; __COUNTER__ is simpler
//#define CUSTOM_COUNTERS //no, just use __COUNTER__ instead (uses fewer levels of recursion)
#ifdef CUSTOM_COUNTERS

//set base line# (reduces #levels of recursion)
#define ENABLE_COUNTERS  CONSTDEF(CtrBase, lineno, __LINE__)
//generate names:
#define CTRVAL(name)  CONCAT(name, _CtrVal)
//#define CTRINC(name)  CONCAT(name, _CtrInc)

//define new counter:
//use specialization to set initial value
//default action is 0-increment on any given line; individual lines override using INC_COUNTER
#define NEW_COUNTER(...)  UPTO_2ARGS(__VA_ARGS__, NEW_COUNTER_2ARGS, NEW_COUNTER_1ARG) (__VA_ARGS__)
#define NEW_COUNTER_1ARG(name)  NEW_COUNTER_2ARGS(name, 0) //default start at 0
//template <int>  CONSTDEF(CTRINC(name), inc, 0);  \
//template <int N>  CONSTDEF(CTRVAL(name), counter, CTRVAL(name)<N - 1>::counter + CTRINC(name)<N - 1>::counter);
//CTRINC(name)<N - 1>::counter);
//template <>  CONSTDEF(CTRVAL(name)<0>, counter, init)
//TODO: combine into 1 const?
#define NEW_COUNTER_2ARGS(name, init)  \
template <int N>  \
CONSTDEF(CTRVAL(name), counter, CTRVAL(name)<N - 1>::counter);  \
template <>  \
CONSTDEF(CTRVAL(name)<CtrBase::lineno - 0>, counter, init)

//inc counter at specific places (using specialization):
//pre-inc (beginning of line) or post-inc (end of line)
//#define POSTINC_COUNTER(...)  UPTO_2ARGS(__VA_ARGS__, POSTINC_COUNTER_2ARGS, POSTINC_COUNTER_1ARG) (__VA_ARGS__)
//#define POSTINC_COUNTER_1ARG(name)  POSTINC_COUNTER_2ARGS(name, 1) //default inc 1
//#define POSTINC_COUNTER_2ARGS(name, amt)  \
//template <>  \
//struct name ## _CtrInc<__LINE__ - CtrBaseLineno> { enum { inc = amt }; }

//#define PREINC_COUNTER(...)  UPTO_2ARGS(__VA_ARGS__, PREINC_COUNTER_2ARGS, PREINC_COUNTER_1ARG) (__VA_ARGS__)
//#define PREINC_COUNTER_1ARG(name)  PREINC_COUNTER_2ARGS(name, 1) //default inc 1
//#define PREINC_COUNTER_2ARGS(name, amt)  \
//template <>  \
//struct name ## _CtrInc<__LINE__ - CtrBaseLineno - 1> { enum { inc = amt }; }

//TODO: doesn't play well in all contexts
#define GET_COUNTER_POSTINC(name)  \
CTRVAL(name)<__LINE__>::counter  \
template <>  CONSTDEF(CTRVAL(name)<__LINE__>, counter, CTRVAL(name)<__LINE__ - 1>::counter + 1)
//template <>  CONSTDEF(CTRINC(name)<__LINE__ - CtrBaseLineno::lineno>, inc, amt)

//#define SAVE_PREINC_COUNTER(...)  UPTO_2ARGS(__VA_ARGS__, SAVE_PREINC_COUNTER_2ARGS, SAVE_PREINC_COUNTER_1ARG) (__VA_ARGS__)
//#define SAVE_POSTINC_COUNTER(var, name, amt)
#else //def CUSTOM_COUNTERS
 #define NEW_COUNTER(...)  //noop
//CAUTION: value changes each time; caller must compensate
 #define GET_COUNTER_POSTINC(name_ignored)  __COUNTER__

//use SAVE_COUNTER / GET_SAVEDCOUNTER to reuse same value
// #define POSTINC_COUNTER(name_ignored)  __COUNTER__
// #define PREINC_COUNTER(name_ignored)  (__COUNTER__ - 1)
#endif //def CUSTOM_COUNTERS
//#define GET_COUNTER_POSTINC(...)  UPTO_2ARGS(__VA_ARGS__, GET_COUNTER_POSTINC_2ARGS, GET_COUNTER_POSTINC_1ARG) (__VA_ARGS__)
//allow caller to adjust for post-inc:
//#define GET_COUNTER_POSTINC_2ARGS(name, adjust)  (GET_COUNTER_POSTINC_1ARG(name) adjust)


//CAUTION: use specific enum name to prevent interchange with other structs:
//#define SAVE_COUNTER_POSTINC(...)  UPTO_3ARGS(__VA_ARGS__, SAVE_COUNTER_POSTINC_3ARGS, SAVE_COUNTER_POSTINC_2ARGS, missing_args) (__VA_ARGS__)
//#define SAVE_COUNTER_POSTINC_2ARGS(var, name)  \
//struct var { enum { counter = GET_COUNTER_POSTINC(name) }; }
//allow caller to adjust for post-inc:
//#define SAVE_COUNTER_POSTINC_3ARGS(var, name, adjust)  \
//struct var { enum { counter = GET_COUNTER_POSTINC(name) adjust }; }
//#define GET_SAVEDCOUNTER(var)  var::counter

//use line# to make unique if needed:
//#define SAVEU_COUNTER_POSTINC(...)  UPTO_3ARGS(__VA_ARGS__, SAVEU_COUNTER_POSTINC_3ARGS, SAVEU_COUNTER_POSTINC_2ARGS, missing_args) (__VA_ARGS__)
//#define SAVEU_COUNTER_POSTINC_2ARGS(prefix, name)  SAVE_COUNTER_POSTINC(CONCAT(prefix, __LINE__), name)
//allow caller to adjust for post-inc:
//#define SAVEU_COUNTER_POSTINC_3ARGS(prefix, name, adjust)  SAVE_COUNTER_POSTINC(CONCAT(prefix, __LINE__), name, adjust)

//#define GET_SAVED_COUNTER(name)  name::counter
//#define GETU_SAVED_COUNTER(prefix)  CONCAT(prefix, __LINE__)::counter


#if 0 //broken
//partial template specialization not allowed within Class :(  kludge by breaking up class into parts
#define Class_NEW_COUNTER(...)  UPTO_3ARGS(__VA_ARGS__, Class_NEW_COUNTER_3ARGS, Class_NEW_COUNTER_2ARGS, Class_NEW_COUNTER_1ARG) (__VA_ARGS__)
//CAUTION: caller supplies class name afterwards:
#define Class_NEW_COUNTER_1ARG(name)  \
NEW_COUNTER(name);  \
template<int N = 0> //needs to be outside of Class :(
#define Class_NEW_COUNTER_2ARGS(cls, name)  Class_NEW_COUNTER_3ARGS(cls, name, 0) //default start at 0
#define Class_NEW_COUNTER_3ARGS(cls, name, init)  \
NEW_COUNTER(name, init);  \
template<int N = init> /*needs to be outside of Class :( */  \
class cls
//class counter must use pre-inc due to partial class inheritance chain:
#define PREINC_Class_COUNTER(...)  UPTO_3ARGS(__VA_ARGS__, PREINC_Class_COUNTER_3ARGS, PREINC_Class_COUNTER_2ARGS, missing_arg) (__VA_ARGS__)
#define PREINC_Class_COUNTER_2ARGS(cls, name)  PREINC_Class_COUNTER_3ARGS(cls, name, 1) //default inc 1
#define PREINC_Class_COUNTER_3ARGS(cls, name, amt)  \
};  \
PREINC_COUNTER(name, amt);  \
template<>  \
class cls<GET_COUNTER_POSTINC(name)>: public cls<GET_COUNTER_POSTINC(name) - amt>  \
{
//kludge: GET_COUNTER(CONCAT(x, y)) breaks cpp; provide in-line CONCAT here:
#define GET_Class_COUNTER(cls, name)  \
cls ## name ## _CtrVal<__LINE__ - CtrBaseLineno>::counter
//get last piece of partial class:
#define Class_HAVING_COUNTER(cls, name)  \
cls<GET_COUNTER_POSTINC(name)>
#endif //0

#endif //ndef _COUNTERS_H
//eof