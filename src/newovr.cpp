
#include <stdio.h>
#include <malloc.h>
#include <new>

//compile: g++ (file) -g -o
//asm out: ... -S
//or  objdump -S --disassemble helloworld > helloworld.dump
// https://stackoverflow.com/questions/137038/how-do-you-get-assembler-output-from-c-c-source-in-gcc
// https://github.com/compiler-explorer/compiler-explorer
// https://godbolt.org/
// https://youtu.be/bSkpMdDe4g4

class parent_t
{
    using self_t = parent_t;
    int pad;
public:
    parent_t()
    {
        printf("parent ctor@0x%p\n", this);
    }
    ~parent_t() { printf("parent dtor@0x%p\n", this); }
    class part_t
    {
        using self_t = part_t;
        int pad;
  enum { CONST = 22 };
    public:
        part_t(int i): prop(i)
        {
            printf("part ctor@0x%p: %d\n", this, i);
        }
        ~part_t() { printf("part dtor@0x%p\n", this); }
    public:
        int prop;
        /*static*/ void* operator new[](size_t size) //, self_t* addr = 0)
        {
            static self_t* ptr = 0;
            self_t* addr = 0;
            ptr = (self_t*)malloc(size); //addr;
            printf("ALLOC part: size %lu, set addr 0x%p, ret ptr 0x%p\n", size, addr, ptr);
            return ptr;
        }
        /*static*/ void operator delete[](void* ptr)
        {
            printf("DELETE part @0x%p\n", ptr);
            free(ptr);
        }
    } parts[4] = { 1, 2, 3, 4};
    int other;
    /*static*/ void* operator new(size_t size) //, self_t* addr = 0)
    {
        static self_t* ptr = 0;
        self_t* addr = 0;
        ptr = (self_t*)malloc(size); //addr;
        printf("ALLOC parent: size %lu, set addr 0x%p, ret ptr 0x%p\n", size, addr, ptr);
        return ptr;
    }
    /*static*/ void operator delete(void* ptr)
    {
        printf("DELETE parent @0x%p\n", ptr);
        free(ptr);
    }
  enum { CONST = 12 };
};

int main()
{
    const int yes = 'Y', no = 'N';
    int x;
    parent_t& p0 = *(parent_t*)0;
    if (&p0 == (parent_t*)0) x = yes;
    else x = no;
    printf("p0 @%p 0x%lx null? %d %d, x = '%c'\n", &p0, (long int)&p0, &p0? 1: 0, &p0 == (parent_t*)0, x);

return 0;
    parent_t& P1 = *new parent_t; //parent_t P1;
    printf("p1 @%p, p1.parts @%p..%p, p1[0].prop @%p, p1[3].prop @%p\n", &P1, &P1.parts[0], &P1.parts[4], &P1.parts[0].prop, &P1.parts[3].prop);
    parent_t P2;
    printf("p2 @%p, p2.parts @%p..%p, p2[0].prop @%p, p2[3].prop @%p\n", &P2, &P2.parts[0], &P2.parts[4], &P2.parts[0].prop, &P2.parts[3].prop);
}

//eof
