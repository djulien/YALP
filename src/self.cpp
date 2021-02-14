#include <stdio.h>
#include <type_traits>
#include <typeinfo>

#define xGET_SELF  \
static auto get_self() { return this; }  \
typedef decltype(get_self()) self_t
//using self_t = typename decltype(get_self())

#define GET_SELF  \
static auto helper() -> std::remove_reference<decltype(*this)>::type;  \
typedef decltype(helper()) self_t
//using self_t = typename decltype(helper())

#define soGET_SELF \
    static auto helper() -> std::remove_reference<decltype(*this)>::type; \
    typedef decltype(helper()) self_t

#define mGET_SELF  \
 typedef typeid(*this) self_t

#define nGET_SELF  \
 template<typename CLS>  \
 class nested  \
 {
     func(CLS* obj)  \
 {
     using cls_type = decltype(*obj); \
 }
 typedef typeid(*this) self_t

class X
{
//  static auto get_self() -> std::remove_reference<decltype(*this)>::type;
//  typedef decltype(get_self() self_t;
  nGET_SELF;
};

struct
{
  nGET_SELF;
} x;

int main()
{
  return 0;
}

//eof
