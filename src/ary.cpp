
#include <stdio.h>
#include <inttypes.h>

class Thing
{
public:
    enum { NUMBUFS = 4, NUMPORTS = 24, UNIV_MAXLEN = 10 };

    using wsnode_t = uint32_t;
    wsnode_t pool[NUMBUFS * NUMPORTS * UNIV_MAXLEN];
    int univlen() { return 6; }
    using univ_t = wsnode_t[12];
    univ_t wsnodes1[NUMBUFS][NUMPORTS][UNIV_MAXLEN];
    univ_t wsnodes2[NUMBUFS][NUMPORTS][univlen()];
public:
    Thing() {}
    ~Thing() {}
};

int main(int argc, const char* argv[])
{
    printf("hello\n");
    return 0;
}
