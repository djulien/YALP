//convert Vixen 2.x Base64-encoded channel values to xLights XML format
//usage: me <seq.vix >chvals.xml
//example C code (buggy) to write BMP file: http://batchloaf.wordpress.com/2011/11/30/writing-bitmap-files-in-windows/
//MSDN info: http://msdn.microsoft.com/en-us/library/windows/desktop/dd183374%28v=vs.85%29.aspx + dd183376%28v=vs.85%29.aspx
//use hexdump -C to verify BMP file contents

#include <iostream>
#include <fstream>
#include <sstream>
#include <cstdlib>
#include <stdio.h>
#include <string>
#include <vector>
#include <stdint.h>

#define div0(n)  ((n)? n: 1) //avoid divide by 0

typedef unsigned char byte;


//using namespace std;

size_t num_errs = 0, num_bytes = 0;
std::string Base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
std::vector<byte> chvals;
int seq_duration = 0, frame_duration = 0;
size_t num_frames = 0, num_ch = 0;


void decode(std::string inbuf);
bool write_frame_text(int frnum);
bool write_frame_bmp(int frnum);


int main()
{
//    cout << "Hello world!" << endl;
    if (Base64.length() != 64) { fprintf(stderr, "ERROR: Base64 length wrong: %d\n", Base64.length()); ++num_errs; }

    bool active = false;
    std::string linebuf;
#if 1
    std::ifstream inf("test2.vix");
#else
 #define inf  std::cin
#endif
    for (int line = 0; getline(/*std::cin*/ inf, linebuf); ++line)
    {
//        getline(std::cin, linebuf);
//        fprintf(stderr, "line %d got length %d: '%s'\n", line, linebuf.length(), linebuf.substr(0, 100).c_str());
        if (!(line % 1000)) fprintf(stderr, "read line %d\r", line);
        size_t ofs1, ofs2;
        if (((ofs1 = linebuf.find("<Time>")) != linebuf.npos) && ((ofs2 = linebuf.find("</Time>")) != linebuf.npos))
        {
            seq_duration = atoi(linebuf.substr(ofs1 + 6, ofs2 - ofs1 - 6).c_str());
            continue;
        }
        if (((ofs1 = linebuf.find("<EventPeriodInMilliseconds>")) != linebuf.npos) && ((ofs2 = linebuf.find("</EventPeriodInMilliseconds>")) != linebuf.npos))
        {
            frame_duration = atoi(linebuf.substr(ofs1 + 25+2, ofs2 - ofs1 - 25+2).c_str());
            continue;
        }
        if (!active && ((ofs1 = linebuf.find("<EventValues>")) != linebuf.npos)) { active = true; linebuf = linebuf.substr(ofs1 + 11+2); }
        if (active)
        {
            if ((ofs2 = linebuf.find("</EventValues>")) != linebuf.npos) { active = false; linebuf = linebuf.substr(0, ofs2); }
            decode(linebuf);
        }
    }

	num_frames = (seq_duration + frame_duration - 1) / div0(frame_duration);
	num_ch = (num_bytes + num_frames - 1) / div0(num_frames);
	int num_empty = 0;
	if (num_frames * num_ch != num_bytes) fprintf(stderr, "Partial frame(s) detected: #bytes %d != #fr %d * #ch %d", num_bytes, num_frames, num_ch);

	for (size_t frofs = 0; frofs < num_bytes; frofs += num_ch)
	{
		if (!(frofs % (100 * num_ch))) fprintf(stderr, "write frame %d\r", frofs / div0(num_ch));
//		if (!write_frame_text(frofs / div0(num_ch))) ++num_empty;
		if (!write_frame_bmp(frofs / num_ch)) ++num_empty;
//		break;
	}
	fprintf(stderr, "Bytes converted: %d, #frames: %d (%d msec each, %f sec total), #non-empty: %d, #channels: %d, errors: %d\n", num_bytes, num_frames, frame_duration, seq_duration / 1000., num_frames - num_empty, num_ch, num_errs);

    return 0;
}


void decode(std::string inbuf)
{
    int a34val[4] = {0}, placeholder = 0;
    for (size_t i = 0; i < inbuf.length(); ++i)
    {
        size_t ch = Base64.find(inbuf[i]);
        if (ch == Base64.npos)
        {
            if (inbuf[i] == '=') ++placeholder;
            else fprintf(stderr, "Bad Base64 char: '%c'\n", inbuf[i]);
            ch = 0;
        }
//        static int debug = 0;
//        if (ch && (debug++ < 4))
//        {
//            fprintf(stderr, "non-zero char %d at in ofs %d, out ofs %d\n", ch, i, num_bytes);
//        }
		a34val[3] *= 64; a34val[3] += ch;
//		if (++debug < 10) print "char[" i "]: ch " ch ", a34 val " a34val[3] >> "/dev/stderr";
		if (i % 4) continue; //4 Base64 chars == 3 bytes
		a34val[1] = int(a34val[3] / 0x10000); a34val[3] -= a34val[1] * 0x10000;
		a34val[2] = int(a34val[3] / 0x100); a34val[3] -= a34val[2] * 0x100;
		if (num_bytes >= chvals.size()) chvals.resize(num_bytes + 1024);
		chvals[num_bytes++] = a34val[1];
		if (placeholder < 2) chvals[num_bytes++] = a34val[2];
		if (placeholder < 1) chvals[num_bytes++] = a34val[3];
//		if (chvals[num_bytes - 3 + placeholder] != a34val[1]) fprintf(stderr, "whoops: %d vs. %d\n", chvals[num_bytes - 3 + placeholder], a34val[1]);
		a34val[3] = 0;
//		if (debug < 10) print "got bytes: " chvals[num_bytes - 3] ", " chvals[num_bytes - 2] ", " chvals[num_bytes - 1];
    }
}


bool write_frame_text(int frnum)
{
	std::stringstream buf;
	bool non_zero = false;
	int frofs = frnum * num_ch;
//	fprintf(stderr, "write fr txt: fr# %d, frofs %d, #ch %d, #b %d, #ch this frame %d\n", frnum, frofs, num_ch, num_bytes, std::min<int>(frofs + num_ch - frofs, num_bytes - frofs));
	for (size_t ch = frofs; (ch < frofs + num_ch) && (ch < num_bytes); ++ch)
	{
		if (chvals[ch]) non_zero = true;
		char valbuf[8];
		sprintf(valbuf, ", %d", chvals[ch]);
		buf << valbuf; //", "; buf << chvals[ch];
	}
	if (non_zero) printf("fr[%d/%d]: %s\n", frofs / div0(num_ch), num_frames, buf.str().substr(3).c_str());
	return non_zero;
}

typedef uint16_t WORD;
typedef uint32_t DWORD;
typedef int32_t LONG;

typedef struct tagBITMAPFILEHEADER {
  WORD  bfType;
  DWORD bfSize;
  WORD  bfReserved1;
  WORD  bfReserved2;
  DWORD bfOffBits;
} BITMAPFILEHEADER, *PBITMAPFILEHEADER;

typedef struct tagBITMAPINFOHEADER {
  DWORD biSize;
  LONG  biWidth;
  LONG  biHeight;
  WORD  biPlanes;
  WORD  biBitCount;
  DWORD biCompression;
  DWORD biSizeImage;
  LONG  biXPelsPerMeter;
  LONG  biYPelsPerMeter;
  DWORD biClrUsed;
  DWORD biClrImportant;
} BITMAPINFOHEADER, *PBITMAPINFOHEADER;

int write_BITMAPFILEHEADER(const BITMAPFILEHEADER& hdr);
int write_BITMAPINFOHEADER(const BITMAPINFOHEADER& info);
int write_RGB(int r, int g, int b);
int write_LONG(int32_t val);
int write_DWORD(uint32_t val);
int write_WORD(int val);

FILE* fout; // = fopen("image.bmp", "wb");

bool write_frame_bmp(int frnum)
{
	bool non_zero = false;
	int frofs = frnum * num_ch;
	char filename[32];
	sprintf(filename, "images/frame_%d.bmp", frnum + 1);
//	svBINMODE = BINMODE; BINMODE = 2; #w
//printf "binmode was %x, is now %x\n", svBINMODE, BINMODE >> "/dev/stderr";
    BITMAPFILEHEADER hdr = {0};
    BITMAPINFOHEADER info = {0};
    fout = fopen(filename, "wb"); //delete previous contents
	hdr.bfType = 0x42 + 0x100 * 0x4D; //"BM" (little endian)
	hdr.bfSize = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER) + 3 * num_ch + num_ch; //file size (in bytes)
	hdr.bfOffBits = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER);
//print "type = " hdr["bfType"] ", size " sizeof_BITMAPFILEHEADER ", " sizeof_BITMAPINFOHEADER >> "/dev/stderr";
//printf "hdr" >> filename;
	write_BITMAPFILEHEADER(hdr);
	info.biSize = sizeof(BITMAPINFOHEADER);
	info.biWidth = 24; //int(sqrt(num_ch));
	info.biHeight = 18; //int(num_ch / int(sqrt(num_ch)));
	info.biPlanes = 1;
	info.biBitCount = 3*8 + 8;
	info.biCompression = 0; //BI_RGB; #uncompressede 24-bit RGB
	info.biSizeImage = 0; //can be 0 for BI_RGB bitmaps
	info.biXPelsPerMeter = int(96 / 0.0254 + .5); //96 dpi
	info.biYPelsPerMeter = int(96 / 0.0254 + .5);
//print "ppm x " info["biXPelsPerMeter"] ", y " info["biXPelsPerMeter"] >> "/dev/stderr";
//	info["biClrUsed"] = 0; #color indices in color table
//	info["biClrImportant"] = 0; #color indices required for displaying bitmap
//printf "info" >> filename;
	write_BITMAPINFOHEADER(info);
//NOTE: bitmap data starts in bottom left corner; use h - y - 1 in y loop
//printf "rgb" >> filename;
	for (size_t ch = frofs; ch < frofs + info.biWidth * info.biHeight; ++ch)
//		if (((ch - frofs) % 3) == 2) write_RGB((ch % 4) * 0x40, 255 - (ch % 4) * 0x40, 0);
		if (((ch - frofs) % 3) == 2)
        {
            int ch1 = ((ch - 2 < frofs + num_ch) && (ch - 2 < num_bytes))? chvals[ch - 2]: 0;
            int ch2 = ((ch - 1 < frofs + num_ch) && (ch - 1 < num_bytes))? chvals[ch - 1]: 0;
            int ch3 = ((ch - 0 < frofs + num_ch) && (ch - 0 < num_bytes))? chvals[ch - 0]: 0;
//            write_RGB(ch1, ch2, ch3); //chvals[ch - 2], chvals[ch - 1], chvals[ch]);
            write_DWORD(ch1 * 0x10000 + ch2 * 0x100 + ch3);
        }
//	BINMODE = svBINMODE;
//printf "binmode restored to %x\n", BINMODE >> "/dev/stderr";
    fclose(fout); fout = 0;
	return non_zero;
}

int write_BITMAPFILEHEADER(const BITMAPFILEHEADER& hdr)
{
	write_WORD(hdr.bfType);
	write_DWORD(hdr.bfSize);
	write_WORD(hdr.bfReserved1);
	write_WORD(hdr.bfReserved2);
	write_DWORD(hdr.bfOffBits);
	return 14; //bytes written
}
int write_BITMAPINFOHEADER(const BITMAPINFOHEADER& info)
{
	write_DWORD(info.biSize);
	write_LONG(info.biWidth);
	write_LONG(info.biHeight);
	write_WORD(info.biPlanes);
	write_WORD(info.biBitCount);
	write_DWORD(info.biCompression);
	write_DWORD(info.biSizeImage);
//debug = true;
	write_LONG(info.biXPelsPerMeter);
//debug = true;
	write_LONG(info.biYPelsPerMeter);
	write_DWORD(info.biClrUsed);
	write_DWORD(info.biClrImportant);
	return 40; //bytes written
}
int write_RGB(int r, int g, int b)
{
	fprintf(fout, "%c%c%c", b % 0x100, g % 0x100, r % 0x100); //NOTE: BGR order
	return 3; //bytes written
}
int write_LONG(int32_t val)
{
	return write_DWORD(val);
}
int write_DWORD(uint32_t val)
{
//if (debug) printf("wr %x,%x,%x,%x\n", val % 0x100, int(val / 0x100) % 0x100, int(val / 0x10000) % 0x10000, int(val / 0x1000000) % 0x100) > "/dev/stderr";
//debug = false;
	fprintf(fout, "%c%c%c%c", val % 0x100, int(val / 0x100) % 0x100, int(val / 0x10000) % 0x10000, int(val / 0x1000000) % 0x100); //little endian
	return 4; //bytes written
}
int write_WORD(int val)
{
	fprintf(fout, "%c%c", val % 0x100, (val / 0x100) % 0x100); //little endian
	return 2; //bytes written
}
