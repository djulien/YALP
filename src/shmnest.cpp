
#include <stdio.h>


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
////////    DATA_T& operator*() { return *m_ptr; } //&m_real; }
//    inline DATA_T& ref() /*const*/ { return *m_ptr; } //m_real; }
///////////    DATA_T* operator->() { return m_ptr; }
//    DATA_T& operator=(const DATA_T& other) { *m_ptr = other; return *this; }
//class shmproxy2: public DATA_T
    operator DATA_T&() { return *m_ptr; }
};


class base: public shmptr<base>
{
public:
//    shmproxy<int> x;
//    shmproxy<int> xs[5];
//    shmptr<int> bz = shmptr<int>(33);
    int bz = 33;
    struct X_t
    {
        int x;
        int xs[5];
    };
    /*shmptr<X_t>*/ X_t X[2];
public:
    base() {}
    ~base() {}
    void dump(const char* desc = 0)
    {
        printf("%s base dump:\n", desc? desc: "(name)");
        for (int i = 0; i < 2; ++i)
            printf("[%d] x: %d, bz %d, xs: %d %d %d %d %d\n", i, X[i].x, bz, X[i].xs[0], X[i].xs[1], X[i].xs[2], X[i].xs[3], X[i].xs[4]);
//            printf("[%d] x: %d, bz %d, xs: %d %d %d %d %d\n", i, ((X_t&)X[i]).x, (int)bz, ((X_t&)X[i]).xs[0], ((X_t&)X[i]).xs[1], ((X_t&)X[i]).xs[2], ((X_t&)X[i]).xs[3], ((X_t&)X[i]).xs[4]);
//            printf("[%d] x: %d, bz %d, xs: %d %d %d %d %d\n", i, X[i]->x, *bz, X[i]->xs[0], X[i]->xs[1], X[i]->xs[2], X[i]->xs[3], X[i]->xs[4]);
    }
};

class child: public base
{
public:
//    shmproxy<int> y;
//    shmproxy<int> ys[5];
    struct Y_t
    {
        int y;
        int ys[5];
    };
    /*shmptr<struct Y_t>*/ Y_t Y[2];
//    shmptr<int> bz = shmptr<int>(44);
    int bz = 44;
public:
    child() {}
    ~child() {}
    void dump(const char* desc = 0)
    {
        printf("%s child dump:\n", desc? desc: "(name)");
        for (int i = 0; i < 2; ++i)
            printf("[%d] y: %d, bz %d, ys: %d %d %d %d %d\n", i, Y[i].y, bz, Y[i].ys[0], Y[i].ys[1], Y[i].ys[2], Y[i].ys[3], Y[i].ys[4]);
//            printf("[%d] y: %d, bz %d, ys: %d %d %d %d %d\n", i, ((Y_t&)Y[i]).y, (int)bz, ((Y_t&)Y[i]).ys[0], ((Y_t&)Y[i]).ys[1], ((Y_t&)Y[i]).ys[2], ((Y_t&)Y[i]).ys[3], ((Y_t&)Y[i]).ys[4]);
//            printf("[%d] y: %d, bz %d, ys: %d %d %d %d %d\n", i, Y[i]->y, *bz, Y[i]->ys[0], Y[i]->ys[1], Y[i]->ys[2], Y[i]->ys[3], Y[i]->ys[4]);
//        base::dump(desc);
        for (int i = 0; i < 2; ++i)
            printf("[%d] x: %d, bz %d, xs: %d %d %d %d %d\n", i, X[i].x, base::bz, X[i].xs[0], X[i].xs[1], X[i].xs[2], X[i].xs[3], X[i].xs[4]);
//            printf("[%d] x: %d, bz %d, xs: %d %d %d %d %d\n", i, X[i].x, (int)base::bz, ((X_t&)X[i]).xs[0], ((X_t&)X[i]).xs[1], ((X_t&)X[i]).xs[2], ((X_t&)X[i]).xs[3], ((X_t&)X[i]).xs[4]);
//            printf("[%d] x: %d, bz %d, xs: %d %d %d %d %d\n", i, X[i]->x, *base::bz, X[i]->xs[0], X[i]->xs[1], X[i]->xs[2], X[i]->xs[3], X[i]->xs[4]);
    }
};


int main()
{
//    shmptr<int> s(1);
    int s = 1;
//    printf("s %d\n", (decltype(s)::type)s);
    printf("s %d\n", s);
    s = 3; printf("s %d\n", s);
    ++s; printf("s %d\n", s);

    child C;
    C.dump();
//    C.Y[0].y = 3; for (int i = 0; i < 4; ++i) ((child::Y_t)C.Y[0]).ys[i] = i;
    C.Y[0].y = 3; for (int i = 0; i < 4; ++i) C.Y[0].ys[i] = i;
//    ((base::X_t)C.X[1]).x = 13; for (int i = 0; i < 4; ++i) ((base::X_t)C.X[1]).xs[i] = 21 + i;
    C.X[1].x = 13; for (int i = 0; i < 4; ++i) C.X[1].xs[i] = 21 + i;
    C.dump();
    printf("sizeof C %lu, sizeof B %lu\n", sizeof(child), sizeof(base));

    
    return 0;
}


#if 0
class shm_t
{
    using self_t = shm_t;
    int pad;
    static inline shm_t& shm() { static shm_t m_shm; return m_shm; } //real_me;
public:
    shm_t()
    {
        printf("shm ctor@0x%p: real @0x%p\n", this, &shm());
    }
    ~shm_t() { printf("shm dtor@0x%p\n", this); }
    class part_t
    {
        using self_t = part_t;
        static inline shm_t& smh() { static shm_t m_shm; return m_shm; }
        part_t& real_me;
    public:
        part_t(int i): real_me(shm().parts[i]) 
        {
            printf("part ctor@0x%p: part[%d]@ 0x%p\n", this, i, &real_me);
        }
        ~part_t() { printf("part dtor@0x%p\n", this); }
    public:
        int prop;
        void dump(const char* desc)
        {
            printf("  %s part_t @0x%p, real@ 0x%p:\n", desc, this, &real_me);
            printf("  prop = %d, real = %d\n", prop, real_me.prop);
        }
    } parts[4] = {0, 1, 2, 3};
    int other;
    void dump()
    {
        printf("shm_t @0x%p:\n", this);
        printf("my other = %d, real other = %d\n", other, shm().other);
        for (int i = 0; i < 4; ++i)
            parts[i].dump("my");
        for (int i = 0; i < 4; ++i)
            shm().parts[i].dump("real");
    }
    static void* operator new(size_t size)
    {
        static shm_t buf[4];
        shm_t* ptr = &buf[2];
        printf("alloc %lu @0x%p in 0x%p..0x%p\n", size, ptr, &buf[0], &buf[4]);
        return ptr;
    }
    static void operator delete(void* ptr)
    {
        printf("delete @0x%p\n", ptr);
    }
  enum { CONST = 12 };
};
//shm_t shm_t::real_me;
//shm_t shm_t::part_t::m_shm;

class child: public shm_t
{
 int more;
};

int main()
{
    child shm;
    printf("const %d\n", child::CONST);
    shm.dump();
    shm.other = 1;
    shm.parts[1].prop = 2;
    shm.dump();
}
#endif

//eof
