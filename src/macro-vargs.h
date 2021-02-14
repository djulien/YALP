//helpers for macro var args
#ifndef _MACRO_ARGS_H
#define _MACRO_ARGS_H


//variable #macro args:
//#ifndef UPTO_1ARG
 #define UPTO_1ARG(skip1, keep2, ...)  keep2
//#endif
//#ifndef UPTO_2ARGS
 #define UPTO_2ARGS(skip1, skip2, keep3, ...)  keep3
//#endif
//#ifndef UPTO_3ARGS
 #define UPTO_3ARGS(skip1, skip2, skip3, keep4, ...)  keep4
//#endif
//#ifndef UPTO_4ARGS
 #define UPTO_4ARGS(skip1, skip2, skip3, skip4, keep5, ...)  keep5
//#endif
 #define UPTO_5ARGS(skip1, skip2, skip3, skip4, skip5, keep6, ...)  keep6
//(add others as needed)
 #define UPTO_10ARGS(skip1, skip2, skip3, skip4, skip5, skip6, skip7, skip8, skip, skip10, keep11, ...)  keep11
//#ifndef UPTO_16ARGS
 #define UPTO_20ARGS(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16, a17, a18, a19, a20, keep21, ...)  keep21
//#endif
//#define example_2ARGS(TYPE, VAR)  example_3ARGS(TYPE, VAR, INIT_NONE) //optional third param
//#define example(...)  UPTO_3ARGS(__VA_ARGS__, example_3ARGS, example_2ARGS, example_1ARG) (__VA_ARGS__)


//extract last arg:
#define LASTARG(...)  UPTO_5ARGS(__VA_ARGS__, LASTARG_5ARGS, LASTARG_4ARGS, LASTARG_3ARGS, LASTARG_2ARGS, LASTARG_1ARG) (__VA_ARGS__)
#define LASTARG_1ARG(keep)  keep
#define LASTARG_2ARGS(skip1, keep)  keep
#define LASTARG_3ARGS(skip1, skip2, keep)  keep
#define LASTARG_4ARGS(skip1, skip2, skip3, keep)  keep
#define LASTARG_5ARGS(skip1, skip2, skip3, skip4, keep)  keep

//remove last arg:
#define DROPLAST(...)  UPTO_5ARGS(__VA_ARGS__, DROPLAST_5ARGS, DROPLAST_4ARGS, DROPLAST_3ARGS, DROPLAST_2ARGS, DROPLAST_1ARG) (__VA_ARGS__)
#define DROPLAST_1ARG(drop)  
#define DROPLAST_2ARGS(keep1, drop)  keep1
#define DROPLAST_3ARGS(keep1, keep2, drop)  keep1, keep2
#define DROPLAST_4ARGS(keep1, keep2, keep3, drop)  keep1, keep2, keep3
#define DROPLAST_5ARGS(keep1, keep2, keep3, keep4, drop)  keep1, keep2, keep3, keep4

//peel off first arg:
//requires work-around; "..." no worky unless 1 arg is passed :(
//#define OTHERS(...)
#define FIRSTARG(...)  UPTO_5ARGS(__VA_ARGS__, FIRSTARG_2ORMORE, FIRSTARG_2ORMORE, FIRSTARG_2ORMORE, FIRSTARG_2ORMORE, FIRSTARG_1ARG) (__VA_ARGS__)
#define FIRSTARG_1ARG(keep)  keep
#define FIRSTARG_2ORMORE(keep, ...)  keep


#endif //ndef _MACRO_ARGS_H
//eof