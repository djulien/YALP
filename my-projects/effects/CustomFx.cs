/*
Copyright (c) 2011-2012 Don Julien.  djulien@thejuliens.net
These effects may be freely distributed and used for non-commerical purposes only.
 These are just some sample effects that I used in my sequences, showing some of the capabilities of FxGen.
 (it can do a lot more than what I used it for!)

Revision history:
 0  6/31/11  DJ  first version; it's time to do some RGB grid animation in Vixen!
1.0 7/14/11  DJ  first stable/usable version
1.1 2/21/12  DJ  cleaned up for general release; move hard-coded stuff to custom fx (child class)
1.2 9/21/12  DJ  a little more clean up for interim release (still pretty messy, though)
    10/6/12  DJ  removed some channel orders that didn't make sense (only inner axis can be zig-zag),
                 fix RGBW channel mapping (use W for grayscale instead of brightness),
                 add Chase fx for M-tree
   10/18/12  DJ  add Effect setup window (called by CustomSequenceUI mods), don't assume A, R, G, B are consecutive
                 fix pixel rounding problem (64 bit graphics on some machines?)
   12/13/13  DJ  2013 nodes
 */


//helpful info:
//drawing GDI bitmaps: http://www.bobpowell.net/drawing_an_image.htm

//Matrix mx = new Matrix();
//mx.Rotate(-30);
//g.Transform = mx;
//g.DrawImage(img,new Point(100,50));

//Rectangle dest = new Rectangle(10,10,100,100);
//Rectangle src = new Rectangle(0,img.Height,img.Width,-img.Height);
//g.DrawImage(img,dest,src,GraphicsUnit.Pixel); 



using System;
//using System.Timers;
using System.Diagnostics;

using System.Text;
using System.Text.RegularExpressions;
//using System.Threading;
//using System.Diagnostics;
using System.Collections.Generic;
using System.Reflection;
//using System.Runtithis.Remoting.Messaging;
//using System.Runtithis.InteropServices;
using System.Windows.Forms;
using System.Xml;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
//using Microsoft.VisualBasic; //just for vbCrLf stuff

//using Vixen;
#if VIXEN21
#warning "Compiled for Vixen 2.1"
#endif
#if VIXEN25
#warning "Compiled for Vixen 2.5"
#endif
using Logger = FxGen_base.Logger;
using ColoredString = FxGen_base.FxGen.ColoredString;
using FrameTag = FxGen_base.FxGen.FrameTag;
using ByteRange = FxGen_base.FxGen.ByteRange;
using FxGenPluginBase = FxGen_base.FxGen.FxGenPluginBase;


namespace MyFx //name is arbitrary
{
//NOTE: make all macro values >~ 20 so they are more visible in the Vixen cell grid
	enum MyMacros
	{
		Noop = 0, //do nothing
//fill:
		FillBkg = 200,
		FillFg = 201,
		FillRGBTest = 202, //test
		BTWipe = 203, TBWipe = 204, //was 203,208 before clup
		LRWipe = 205, MidWipe = 206, EdgeWipe = 207, //was 204,209,210 before clup
		Spiral = 208, //was 205
		GECETest_zzud = 209, //transition; was 206
		GECETest_zzlr = 210, //transition; was 207
//		FillOneByOne = 211, //test
//outline:
		DrawBorder = 211,
		BTLine = 212,
		LRLine = 213,
		SpiralLine = 214,
		DrawColumn0 = 215, DrawColumn1 = 216, DrawColumn2 = 217, DrawColumn3 = 218, //2 upper bits for col# >= 16
		DrawRow = 219,
//misc:
		DrawCorners = 221, //test
		Fade = 222,
		Ramp = 223,
		TreeEcho = 224,
		SwirlCw = 225, SwirlCcw = 226,
		Burst = 227,
		Snow = 220, //was 228
//		EqBar0 = 228, EqBar1 = 229, EqBar2 = 230, EqBar3 = 231, EqBar4 = 232, //was 180,181,182,183,184
		EqBar0 = 180, EqBar1 = 181, EqBar2 = 182, EqBar3 = 183, EqBar4 = 184, //was 180,181,182,183,184
//images:
		ShowBitmap = 233, //static or animated; was 231(VixenXS),232(Cross),233(Hippo-peak),234(Hippo-static),235(globe)
//text:
		ShowText = 234, //can be scrolled; was 190(TuneTo),191(Merry Christmas),192(Tune To vscroll),193(Happy New Year),194
		Countdown = 235,
		Timer = 236, //was 195
//new additions:
		Chase = 240, //allow virtualized M-tree (dumb strings or smart pixels)
		Talk = 241, //automatically decompose text track into phonemes and map to mouth shapes (virtualized Papagayo)
		One2Many = 242, //allow single channels to be mapped to groups of channel (can be used for face, string -> node list, etc)
		SpiralXition = 243 //cover up existing nodes one at a time using a spiral pattern
	}

//	enum ControlChars { Lf = "\n", Cr = "\r", CrLf = "\r\n" };

//allow fractional notation (handy for scroll speeds):
	public class Fraction
	{
		public int Numerator = 1;
		public int Denominator = 1;
		private static Regex parser = new Regex("^\\s*([+-]?\\d+)\\s*(/\\s*(\\d+)\\s*)?$");
		public Fraction(string astxt) { Parse(astxt, null); }
		public Fraction(string astxt, string def) { Parse(astxt, def); }
		public bool Parse(string astxt) { return Parse(astxt, null); }
		public bool Parse(string astxt, string def)
		{
			Match parts = parser.Match(!String.IsNullOrEmpty(astxt)? astxt: !String.IsNullOrEmpty(def)? def: String.Empty);
			if (parts.Success) //&& (parts.Groups.Count >= 1+1))
			{
				this.Numerator = Convert.ToInt16(parts.Groups[1].Value);
				if (String.IsNullOrEmpty(parts.Groups[3].Value) /*parts.Groups.Count < 3+1*/) { this.Denominator = 1; return true; }
				this.Denominator = Convert.ToInt16(parts.Groups[3].Value);
				if (Logger.WantTrace) Logger.LogMsg(String.Format("Fraction.parse: '{0}' => {1} parts, match? {2}, num {3}, den {4}", astxt, parts.Groups.Count, parts.Success, this.Numerator, this.Denominator), String.Empty);
				if (this.Denominator != 0) return true;
			}
			if (String.IsNullOrEmpty(def)) throw new Exception(String.Format("invalid fractional value: '{0}'", astxt));
			return false;
		}
		public override string ToString()
		{
			return (this.Denominator == 1)? this.Numerator.ToString(): String.Format("{0}/{1}", this.Numerator, this.Denominator);
		}
	}


//extend generic FxGen base class with custom effects:
public partial class MyCustomFx: FxGenPluginBase
{
//override some Vixen FxGen plug-in props:
	public override String MyName() { return "My custom/sample effects"; } //name will show in Vixen Plugins Setup window
	public override String MyDesc() { return "Just some sample effects I used"; }
	public override String MyAuthor() { return "DIYC::djulien"; }

#region "Main dispatch"
//state info:
	private Size m_wh;
	private int m_frame;
	private int m_repeated;
	private int m_timestamp;
	private int m_unknfuncs;
	private MyMacros m_nextmacro = MyMacros.Noop;
	private string m_fxtext = String.Empty;
	private string m_fxpanelname = String.Empty;
	private int m_fxchfunc = -1; //channel# of macro function
	private int m_fxchparam = -1; //channel# of parameter
	private int m_fxchtext = -1; //channel# of text info
	private int[] m_fxchcolor = new int[] {-1, -1, -1, -1}; //channel# of ARGB color
	private int[] m_fxchecho = new int[] {-1, -1, -1}; //start, end, #channels to echo (RGBW floods)
//GDI-related info:
	private Graphics m_gr = null;
//	private Bitmap m_canvas = null;
	private Rectangle m_rect;

//ctor:
//	public MyCustomFx()
//	{
//	}
	
//dtor:
//	~MyCustomFx()
//	{
//	}

	private string m_fxdebug;
//main fx dispatch:
//This function is called for each virtual plug-in for each frame, and also once for startup and shutdown.
//Renders custom effects into frame buffer.
//params:
//  frame = current frame# within sequence (-1 for startup, 0x80000000 for shutdown)
//  timestamp = #msec for current frame (frame# * event period)
//  frbuf = channel values to/from Vixen
//returns:
//  flag telling if channel values (frbuf) changed
	private bool m_didfx; //flag to streamline unmap() for echo-only
	public override bool FxGen(int frame, int timestamp, ByteRange frbuf)
	{
//copy context to private members (cuts down on parameter passing):
		this.m_frame = frame;
		this.m_timestamp = timestamp;
		try{

		if (frame == Int32.MinValue) // startup
		{
			parsetags(); //pull channel#s from config tag
			verify_funccodes(); //validate macro function code#s (paranoid)
//set up GDI graphics context and bounding rect:
			if (this.m_gr == null)
			{
				this.m_gr = Graphics.FromImage(this.Canvas); //NOTE: map() might already have set this
				this.m_gr.PixelOffsetMode = PixelOffsetMode.Half; //avoid zoom rounding errors; see http://www.gamedev.net/topic/314481-drawimage-zoomed-pixel-offset-problem/
			}
			this.m_rect = new Rectangle(0, 0, this.Geometry.Width, this.Geometry.Height);
//CAUTION: hard-coded max width 120
			this.m_wh = new Size(Math.Min(Math.Max(this.Geometry.Width, 2), 120), Math.Max(this.Geometry.Height, 2));
			this.m_unknfuncs = 0;
//tranform not needed:
//			Matrix mx = new Matrix(1, 0, 0, -1, 0, base.Geometry.Height);
//			this.m_gr.Transform = mx; //put the origin at bottom left for more natural drawing
			return false;
		}
		if (frame == Int32.MaxValue) //shutdown
		{
//TODO: dispose and other cleanup? (check for memory leaks)
			for (int i=0; i<this.m_snflakes.Length; ++i) this.m_snflakes[i] = null;
			for (int i=0; i<this.m_eqbars.Length; ++i) this.m_eqbars[i] = null;
			return false;
		}
		if (this.m_fxchfunc == -1) throw new Exception(String.Format("plug-in channel alias tag '{0}' was not in expected format \"func: #\": got {1}, {2}, {3}", this.PluginTag, this.m_fxchfunc, this.m_fxchparam, this.m_fxchcolor[0])); //paranoid check on plug-in tag and startup conditions
		if (this.m_fxchparam == -1) throw new Exception(String.Format("plug-in channel alias tag '{0}' was not in expected format \"param: #\": got {1}, {2}, {3}", this.PluginTag, this.m_fxchfunc, this.m_fxchparam, this.m_fxchcolor[0])); //paranoid check on plug-in tag and startup conditions
		if (this.m_fxchcolor[0] == -1) throw new Exception(String.Format("plug-in channel alias tag '{0}' was not in expected format \"color: [#, #, #, #]\": got {1}, {2}, {3}", this.PluginTag, this.m_fxchfunc, this.m_fxchparam, this.m_fxchcolor[0])); //paranoid check on plug-in tag and startup conditions

//TODO: allow chaining so fx can be applied to bitmaps?
		if (frame < 0) return false; //eof?
		MyMacros macro = (MyMacros)base.HostChannel(this.m_fxchfunc, frame); //get fx function for this prop from current frame
//		if (macro != MyMacros.Noop) macro = MyMacros.FillFg; //TEMP Halloween KLUDGE! 10/31/12
//		else macro = MyMacros.FillBkg; //TEMP Halloween KLUDGE! 10/31/12
		this.m_fxdebug = String.Format("fx {0}[ch {1}, fr {2}] = {3}", this.m_fxpanelname, this.m_fxchfunc, frame, macro.ToString()); //cuts down on repetitive debug info
		if (Logger.WantTrace) Logger.LogMsg(String.Format("evt[{0}] got macro {1} for {2}", frame, macro, this.m_fxdebug), this.PluginID);
		if (macro == MyMacros.Noop) { macro = this.m_nextmacro; ++this.m_repeated; } //check if repeated from last time
		else { this.m_nextmacro = macro; this.m_repeated = 0; } //auto-repeat until cancelled
		bool sticky = false; //default to one-shot effects
		this.m_didfx = true;
//main dispatch:
		switch (macro)
		{
			case MyMacros.Noop:
//				LogMsg(String.Format("FxGen[{0}]: leave frame as-is", frame));
				this.m_didfx = false;
				return true; //EchoFloods(); //false; //no effect in progress
//basic graphics:
			case MyMacros.FillFg:
			case MyMacros.FillBkg:
				FillSolid(macro == MyMacros.FillBkg);
				break;
			case MyMacros.DrawBorder:
				DrawBorder();
				break;
//test effects:
			case MyMacros.FillRGBTest:
				sticky = FillRGBTest();
				break;
//			case MyMacros.FillOneByOne:
//				FillOneByOne();
//				break;
			case MyMacros.DrawCorners:
				DrawCorners();
				break;
			case MyMacros.GECETest_zzud:
				sticky = GECETest_zzud();
				break;
			case MyMacros.GECETest_zzlr:
				sticky = GECETest_zzlr();
				break;
//misc graphics:
			case MyMacros.ShowBitmap:
				sticky = ShowBitmap();
				break;
			case MyMacros.Fade:
				sticky = Fade();
				break;
			case MyMacros.Ramp:
				sticky = Ramp();
				break;
			case MyMacros.LRWipe:
			case MyMacros.LRLine:
				sticky = LRWipe(macro == MyMacros.LRWipe);
				break;
			case MyMacros.TBWipe:
				sticky = TBWipe(true);
				break;
			case MyMacros.BTWipe:
			case MyMacros.BTLine:
				sticky = BTWipe(macro == MyMacros.BTWipe);
				break;
			case MyMacros.MidWipe:
			case MyMacros.EdgeWipe:
				sticky = MidWipe(macro == MyMacros.MidWipe);
				break;
			case MyMacros.TreeEcho:
				sticky = TreeEcho();
				break;
			case MyMacros.Spiral:
			case MyMacros.SpiralLine:
				sticky = Spiral(macro == MyMacros.Spiral);
				break;
			case MyMacros.DrawRow:
				DrawRow();
				break;
			case MyMacros.DrawColumn0:
			case MyMacros.DrawColumn1:
			case MyMacros.DrawColumn2:
			case MyMacros.DrawColumn3:
				DrawColumn(macro - MyMacros.DrawColumn0);
				break;
			case MyMacros.SwirlCw:
			case MyMacros.SwirlCcw:
				sticky = Swirl(macro == MyMacros.SwirlCcw);
				break;
			case MyMacros.Burst:
				sticky = Burst();
				break;
			case MyMacros.Snow:
				sticky = Snow();
				break;
			case MyMacros.EqBar0:
			case MyMacros.EqBar1:
			case MyMacros.EqBar2:
			case MyMacros.EqBar3:
			case MyMacros.EqBar4:
				sticky = EqBars(macro - MyMacros.EqBar0);
				break;
//text:
//NOTE: 5x7 looks too high on 32x12.5 snowglobe, so just keep it to 5x5 for now
			case MyMacros.ShowText:
				sticky = ShowText();
				break;
			case MyMacros.Countdown:
				sticky = Countdown();
				break;
			case MyMacros.Timer:
				sticky = Timer();
				break;

//new additions:
			case MyMacros.Chase:
				sticky = Chase();
				break;

			case MyMacros.One2Many:
				sticky = One2Many();
				break;

			case MyMacros.SpiralXition:
				sticky = SpiralXition();
				break;

//'			case 254: 'copy channels as-is
//''				LogMsg(String.Format("FxGen: copy {0}..{1}", PluginWrapper.MinChannel, PluginWrapper.MaxChannel))
//'				For ch As Integer = PluginWrapper.MinChannel To PluginWrapper.MaxChannel
//'					frbuf(ch -1) = seq.EventValues(ch, frame Mod seq.TotalEventPeriods)
//'				Next ch
//'				DataChanged = True

//TODO: add other custom Fx here
			default:
				if (Logger.WantTrace) Logger.LogMsg(String.Format("FxGen[{0}]: unknown macro function {1} in channel {2}", frame, macro, this.m_fxchfunc), this.PluginID);
				if (this.m_unknfuncs++ < 1) throw new Exception(String.Format("FxGen[{0}]: unknown macro function {1} in channel {2}", frame, macro, this.m_fxchfunc)); //throw error the first time to make it more noticeable
				break;
		}
		if (!sticky) this.m_nextmacro = MyMacros.Noop; //one-shot function; do not auto-repeat on next frame
//		EchoFloods();
		return true; //frame buffer is dirty; refresh needed
	}catch(Exception exc){ //just report error and allow other fx to run
		StackFrame stkf = (new StackTrace(/*(exc.InnerException != null)? exc.InnerException:*/ exc, true)).GetFrame(0);
		Logger.ReportError(String.Format("MacroFunc {0}[{1}] @{2}.{3}:{4}", this.m_nextmacro.ToString(), frame, System.IO.Path.GetFileNameWithoutExtension(stkf.GetFileName()), stkf.GetMethod().Name, stkf.GetFileLineNumber()), exc, this.PluginID);
		return false;
	}}
#endregion

//regex to parse plug-in tag (channel aliases):
//tag is in the format "name: Border, func: 1, param: 12, color: [9,10,11,12], echo: [48,63,16]" (this was arbitrary, but easy to parse)
	private static Regex functag = new Regex("func:\\s*(\\d+)");
	private static Regex paramtag = new Regex("param:\\s*(\\d+)");
	private static Regex colortag = new Regex("color:\\s*\\[(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)\\]"); //A, R, G, B
	private static Regex echotag = new Regex("echo:\\s*\\[(\\d+),(\\d+),(\\d+)]");
	private static Regex texttag = new Regex("text:\\s*(\\d+)");
	private static Regex nametag = new Regex("name:\\s*([A-Za-z0-9_]+)"); //this one only used for debug
//extract channel#s for macro function, parameter, and color from plug-in tag:
	private void parsetags()
	{
//required:
		Match parts = functag.Match(this.PluginTag);
		if (parts.Success && (parts.Groups.Count == 1+1)) this.m_fxchfunc = Convert.ToInt32(parts.Groups[1].Value);
		parts = paramtag.Match(this.PluginTag);
		if (parts.Success && (parts.Groups.Count == 1+1)) this.m_fxchparam = Convert.ToInt32(parts.Groups[1].Value);
		parts = colortag.Match(this.PluginTag);
		if (parts.Success && (parts.Groups.Count == 4+1))
		{
			this.m_fxchcolor[0] = Convert.ToInt32(parts.Groups[1].Value);
			this.m_fxchcolor[1] = Convert.ToInt32(parts.Groups[2].Value);
			this.m_fxchcolor[2] = Convert.ToInt32(parts.Groups[3].Value);
			this.m_fxchcolor[3] = Convert.ToInt32(parts.Groups[4].Value);
		}
		parts = nametag.Match(this.PluginTag);
		if (parts.Success && (parts.Groups.Count == 1+1)) this.m_fxpanelname = parts.Groups[1].Value;
//optional:
		parts = echotag.Match(this.PluginTag);
		if (parts.Success && (parts.Groups.Count == 3+1)) //this.m_fxchecho = Convert.ToInt32(parts.Groups[1].Value);
		{
			this.m_fxchecho[0] = Convert.ToInt32(parts.Groups[1].Value);
			this.m_fxchecho[1] = Convert.ToInt32(parts.Groups[2].Value);
			this.m_fxchecho[2] = Convert.ToInt32(parts.Groups[3].Value);
		}
		parts = texttag.Match(this.PluginTag);
		if (parts.Success && (parts.Groups.Count == 1+1)) this.m_fxchtext = Convert.ToInt32(parts.Groups[1].Value);
		if (Logger.WantTrace) Logger.LogMsg(String.Format("{0} parse tags: func {1}, param {2}+, color [{3},{4},{5},{6}], echo [{7},{8},{9}], text {10}", this.m_fxpanelname, this.m_fxchfunc, this.m_fxchparam, this.m_fxchcolor[0], this.m_fxchcolor[1], this.m_fxchcolor[2], this.m_fxchcolor[3], this.m_fxchecho[0], this.m_fxchecho[1], this.m_fxchecho[2], this.m_fxchtext), this.PluginID);
	}

//enumerate function codes for FxGen to write to sequence:
	public override Dictionary<string, int> EnumFuncCodes()
	{
//		StringBuilder sb = new StringBuilder();
		Dictionary<string, int> codes = new Dictionary<string, int>();
		foreach (MyMacros code in Enum.GetValues(typeof(MyMacros)))
			codes.Add(code.ToString(), Convert.ToInt32(code));
		return codes;
//		if (Logger.WantTrace) Logger.LogMsg(String.Format("{0} fx: {1} macro func codes check out okay", this.m_fxpanelname, Enum.GetValues(typeof(MyMacros)).Length));
	}

//verify that function codes compiled in here match values used in sequence:
//this is used as a santy check to protect against mismatches between DLL and sequence
	void verify_funccodes()
	{
//		Logger.LogMsg(String.Format("funccodes: #tracks {0}, #tags {1}", FrameTag.TrackCount, FrameTag.TagCount));
		foreach (MyMacros code in Enum.GetValues(typeof(MyMacros)))
		{
//			Logger.LogMsg(String.Format("funccodes: code {0} val {1}", code, Convert.ToInt32(code)));
			string ft = FrameTag.ByValueAsText("fxfunc", Convert.ToInt32(code));
//			Logger.LogMsg(String.Format("funccodes: frametag {0}, cmp txt {1}", ft, code.ToString()));
			if (/*(code == MyMacros.Noop) &&*/ String.IsNullOrEmpty(ft)) continue; //don't care about this one; allow all to be optional
			if (ft.Equals(code.ToString())) continue;
			throw new Exception(String.Format("Macro func '{0}' value {1} {2} in sequence frame tags", code.ToString(), Convert.ToInt32(code), String.IsNullOrEmpty(ft)? "not found": "mismatch"));
		}
		if (Logger.WantTrace) Logger.LogMsg(String.Format("{0} fx: {1} macro func codes check out okay", this.m_fxpanelname, Enum.GetValues(typeof(MyMacros)).Length), this.PluginID);
	}

#region "Custom effects"
//show a static or animated bitmap:
	private Bitmap m_bmp = null;
	private bool ShowBitmap()
	{
//TODO: allow bitmap to be embedded into DLL:
//		Me.components = New System.ComponentModel.Container
//		Me.firstFrameToolStripButton.Image = CType(resources.GetObject("firstFrameToolStripButton.Image"),System.Drawing.Image)
//TODO: rot, etc
//		int wantrot = this.m_seq.EventValues[this.m_macofs + 1, this.m_frame]; //, MyBitmaps) ' Mod seq.TotalEventPeriods)
//======cleaned up to here
		if (this.m_repeated < 1) //effect starting
		{
//			if (Logger.WantTrace) Logger.LogMsg(String.Format("show bitmap here1 {0}", this.m_fxchtext), this.PluginID);
			if (this.m_fxchtext == -1) return false; //nowhere to get filename
			FrameTag bmpnode = FrameTag.ByValue("fximage", this.HostChannel(this.m_fxchtext, this.m_frame));
			if (bmpnode == null) bmpnode = FrameTag.ByFrame("fximage", this.m_frame);
//			if (Logger.WantTrace) Logger.LogMsg(String.Format("show bitmap here2 {0}", bmpnode != null), this.PluginID);
			string bmpfile = (bmpnode != null)? bmpnode.TagNode.InnerText: String.Empty;
			if (String.IsNullOrEmpty(bmpfile)) return false; //no file to display
			if (this.m_bmp != null) this.m_bmp.Dispose();
			this.m_bmp = GetBitmap(bmpfile);
//			if (Logger.WantTrace) Logger.LogMsg(String.Format("show bitmap here3 {0}", this.m_bmp != null), this.PluginID);
			if (this.m_bmp == null) throw new Exception(String.Format("ShowBitmap: can't find '{0}'", bmpfile));
//			this.m_wantani = (this.m_bmp.Width > 50); //TODO: detect this better
//			this.m_speed = this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
//			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
//			else this.m_wantani = true;
//			this.m_dir = ((this.m_speed & 0x80) != 0)? true: false; //make it reversable to allow nested effects
//			this.m_loop = ((this.m_speed & 0x40) != 0)? true: false; //make it reversable to allow nested effects
//			this.m_speed &= ~0xC0;
			GetAnimation(bmpnode); //, new Size(this.m_bmp.Width, this.m_bmp.Height)); //speed, direction, etc
		}
//		if (Logger.WantTrace) Logger.LogMsg("show bitmap here4", this.PluginID);
//		GraphicsState gs = this.m_gr.Save();
//		if (wantrot != 0)
//		{
//			Matrix mx = new Matrix();
//			mx.Rotate(wantrot * this.m_repeated);
//			this.m_gr.Transform = mx;
//			//g.DrawImage(img,new Point(100,50));
//		}
//		else
//		{
//			Matrix mx = new Matrix();
//			mx.Invert();
//			mx.Rotate(45);
//			mx.Translate(this.m_bmp.Width/2, -this.m_bmp.Height/2);
//			this.m_gr.Transform = mx;
//		}
#if false
		bool wantani = (this.m_ani.hscroll.Numerator /*m_speed*/ != 0), wantrot = false; //TODO: rot
		if (!wantani && !wantrot) this.m_nextmacro = MyMacros.Noop; //one-shot function
//NOTE: draw invisible parts in case target prop is larger than displayed bitmap:
		this.m_gr.FillRectangle(new SolidBrush(this.m_bg), 0, 0, this.Geometry.Width, this.Geometry.Height); //fill bkg in case bmp is smaller
#if false
//upside down		this.m_gr.DrawImage(this.m_bmp, new Point(16 * this.m_repeated, 0)); //, this.Geometry.Width, this.Geometry.Height);
Rectangle dest = new Rectangle(0, 0, this.Geometry.Width, this.Geometry.Height);
//Rectangle src = new Rectangle(wantani? (16 * this.m_repeated): 0, this.m_bmp.Height, this.m_bmp.Width, -this.m_bmp.Height); //vert flip
Rectangle src = new Rectangle(wantani? (16 * this.m_repeated): 0, 0, this.m_bmp.Width, this.m_bmp.Height); //vert flip
this.m_gr.DrawImage(this.m_bmp, dest, src, GraphicsUnit.Pixel);
//		this.m_gr.DrawImage(this.m_bmp, new Rectangle(-16 * this.m_repeated, 0, this.Geometry.Width, -this.Geometry.Height));
wantani = false;
#endif
//kludge: vertical is mirrored; use Points so that we can un-invert it:
		int rpt = wantani? this.m_repeated * Math.Abs(this.m_ani.hscroll.Numerator) / this.m_ani.hscroll.Denominator /*this.m_speed*/: 0;
		int yofs = (this.Geometry.Height - this.m_bmp.Height)/2 /*+ 1*/;
//TODO: stretch to fill, or other transforms?
		ColorMap[] cmtbl = { new ColorMap() };
		cmtbl[0].OldColor = Color.FromArgb(255, 255, 0, 255); //take magenta pixels in bitmap
		cmtbl[0].NewColor = this.m_bg; //... and replace them with desired brush color
		ImageAttributes imgattr = new ImageAttributes();
		imgattr.SetRemapTable(cmtbl, ColorAdjustType.Bitmap);
		Point[] bmpxy = {new Point(0, this.Geometry.Height - yofs), new Point(wantani? this.Geometry.Width: this.m_bmp.Width, this.Geometry.Height - yofs), new Point(0, this.Geometry.Height - yofs - this.m_bmp.Height)}; //upper left, upper right, lower left
		if (Logger.WantTrace) Logger.LogMsg(String.Format("{0}, speed {1}/{2}, loop {3}, repeated {4}, rpt {5}, ofs {6}, img {7}x{8}, multi? {9}, rot? {10}, draw at ({11},{12})", this.m_fxdebug, this.m_ani.hscroll.Numerator, this.m_ani.hscroll.Denominator, this.m_ani.loop, this.m_repeated, rpt, -16 * this.m_repeated, this.m_bmp.Width, this.m_bmp.Height, this.m_bmp.Width > 16, wantrot, bmpxy[1].X, bmpxy[1].Y));
//NOTE: draw invisible parts in case target prop is larger than displayed bitmap:
		this.m_gr.DrawImage(this.m_bmp, bmpxy, new Rectangle(!wantani? 0: (this.m_ani.hscroll.Numerator > 0)? this.Geometry.Width * rpt: (this.m_bmp.Width - (this.Geometry.Width + 1) * rpt), 0, wantani? this.Geometry.Width: this.m_bmp.Width, this.m_bmp.Height), GraphicsUnit.Pixel, imgattr);
		if (this.m_ani.loop == -1) return true; //forever
		return (this.m_ani.loop-- > 0) || (this.Geometry.Width * (rpt + 1) < this.m_bmp.Width); //this.m_nextmacro = MyMacros.Noop; //end of animation

//		this.m_gr.Restore(gs);
#endif
		Point xyofs = Animate(this.m_bmp.Size, false);
		if (xyofs.X == -this.m_bmp.Size.Width) xyofs.X = 0; //show at least something; prevent gap during animation wrap
//draw invisible parts in case target prop is larger than displayed bitmap:
		this.m_gr.FillRectangle(new SolidBrush(this.m_bg), 0, 0, this.Geometry.Width, this.Geometry.Height); //fill bkg in case bmp is smaller
		ColorMap[] cmtbl = { new ColorMap() };
		cmtbl[0].OldColor = Color.FromArgb(255, 255, 0, 255); //take magenta pixels in bitmap
		cmtbl[0].NewColor = this.m_bg; //... and replace them with desired brush color
		ImageAttributes imgattr = new ImageAttributes();
		imgattr.SetRemapTable(cmtbl, ColorAdjustType.Bitmap);
//kludge: vertical is mirrored; use Points so that we can un-invert it:
//TODO: stretch to fill, or other transforms?
		Point[] bmpxy = {new Point(xyofs.X, xyofs.Y + this.m_bmp.Height /*this.Geometry.Height - xyofs.Y*/), new Point(xyofs.X + this.m_bmp.Width, /*this.Geometry.Height - xyofs.Y*/ xyofs.Y + this.m_bmp.Height), new Point(xyofs.X, /*this.Geometry.Height - xyofs.Y - this.m_bmp.Height*/ xyofs.Y)}; //destination: upper left, upper right, lower left
		if (Logger.WantTrace) Logger.LogMsg(String.Format("{0}, hscroll {1}/{2}, vscroll {3}/{4}, loop {5}, repeated {6}, ofs X {7}, Y {8}, bmp {9}x{10}, geom {11}x{12}", this.m_fxdebug, this.m_ani.hscroll.Numerator, this.m_ani.hscroll.Denominator, this.m_ani.vscroll.Numerator, this.m_ani.vscroll.Denominator, this.m_ani.loop, this.m_repeated, xyofs.X, xyofs.Y, this.m_bmp.Width, this.m_bmp.Height, this.Geometry.Width, this.Geometry.Height), this.PluginID);
//unlike text, to wrap bitmaps just make them that way
		this.m_gr.DrawImage(this.m_bmp, bmpxy, new Rectangle(0, 0, this.m_bmp.Width, this.m_bmp.Height), GraphicsUnit.Pixel, imgattr);
		if (this.m_ani.loop == -1) return true; //forever
//		return (this.m_ani.loop-- > 0) || (this.Geometry.Width * (rpt + 1) < this.m_bmp.Width); //this.m_nextmacro = MyMacros.Noop; //end of animation
		return (this.m_ani.loop-- > 0);
	}
//NOTE: draw invisible parts in case target prop is larger than displayed bitmap:
//		this.m_gr.DrawImage(this.m_bmp, bmpxy, new Rectangle(!wantani? 0: (this.m_ani.hscroll.Numerator > 0)? this.Geometry.Width * rpt: (this.m_bmp.Width - (this.Geometry.Width + 1) * rpt), 0, wantani? this.Geometry.Width: this.m_bmp.Width, this.m_bmp.Height), GraphicsUnit.Pixel, imgattr);

//Rectangle dest = new Rectangle(10,10,100,100);
///Rectangle src = new Rectangle(0,img.Height,img.Width,-img.Height);
//g.DrawImage(img,dest,src,GraphicsUnit.Pixel); 

//'misc color fx:
	private Color m_fg = Color.FromArgb(255, 255, 255, 255), m_bg = Color.Black;
	private void FillSolid(bool setbkg) //TEMP KLUDGE! 10/13/12
	{
		GetFgColor(true);
//		if (setbkg) this.m_bg = this.m_fg; //remember bkg color for use later
		if (Logger.WantTrace) Logger.LogMsg(String.Format("FxGen: fill {0}x{1} with {2}, bg? {3}, pixel type {4}", this.Geometry.Width, this.Geometry.Height, this.m_fg.ToString(), setbkg, this.PixelType), this.PluginID);
//		if (this.m_repeated < 1) this.m_fg = colors[inx % colors.Length];
		this.m_gr.FillRectangle(new SolidBrush(setbkg? this.m_bg: this.m_fg), 0, 0, this.Geometry.Width, this.Geometry.Height);
		this.m_nextmacro = MyMacros.Noop; //one-shot function
	}
	private void xFillSolid(bool setbkg)
	{
		GetFgColor(true);
		if (setbkg) this.m_bg = this.m_fg; //remember bkg color for use later
		if (Logger.WantTrace) Logger.LogMsg(String.Format("FxGen: fill {0}x{1} with {2}, bg? {3}, pixel type {4}", this.Geometry.Width, this.Geometry.Height, this.m_fg.ToString(), setbkg, this.PixelType), this.PluginID);
//		if (this.m_repeated < 1) this.m_fg = colors[inx % colors.Length];
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), 0, 0, this.Geometry.Width, this.Geometry.Height);
		this.m_nextmacro = MyMacros.Noop; //one-shot function
	}

//	private int m_fg, m_bg;
	private void DrawBorder()
	{
		GetFgColor(true);
//		Logger.LogMsg(String.Format("FxGen: border {0}x{1} with {2}", base.Geometry.Width, base.Geometry.Height, colors[inx % colors.Length].ToString()));
//draw border:
//border needs to be slightly smaller than client rect fxea.Rect, which is actual width + height
//		fxea.Graphics.DrawRectangle(new Pen(Brushes.White), fxea.Rect);
		int onthickness = this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
//		int offthick = thickness >> 4, onthick = thickness & 0xf;
		int offthickness = this.HostChannel(this.m_fxchparam + 1, this.m_frame); //.m_seq.EventValues[
//		if (this.m_repeated < 1) this.m_fg = colors[inx % colors.Length];
		onthickness += offthickness; //on first, then off
		if (Logger.WantTrace) Logger.LogMsg(String.Format("FxGen: border {0}x{1} thickness {2}..{3} with {4}", this.Geometry.Width, this.Geometry.Height, offthickness, onthickness, this.m_fg.ToString()), this.PluginID);
		while (onthickness-- > offthickness)
		{
			Pen pen = new Pen(new SolidBrush(this.m_fg));
			this.m_gr.DrawRectangle(pen, onthickness, onthickness, this.m_wh.Width - 2 * onthickness -1, this.Geometry.Height - 2 * onthickness -1);
//			pen = new Pen(new SolidBrush(Color.FromArgb(255, 255, 0, 255))); //this.m_fg)); //for debug only
			this.m_gr.DrawLine(pen, onthickness - 1, onthickness - 1, onthickness + 0, onthickness + 0); //kludge: some machines leave a diagonal bkg line (64-bit graphics?)
		}
		this.m_nextmacro = MyMacros.Noop; //one-shot function
	}

	private int m_prevtime = 0, m_offset = 0;
	private static Color[] colors = {Color.FromArgb(0, 0, 0), Color.FromArgb(0xff, 0, 0), Color.FromArgb(0, 0xff, 0), Color.FromArgb(0xff, 0xff, 0), Color.FromArgb(0, 0, 0xff), Color.FromArgb(0xff, 0, 0xff), Color.FromArgb(0, 0xff, 0xff), Color.FromArgb(0xff, 0xff, 0xff)};
	private bool FillRGBTest()
	{
		if (Logger.WantTrace) Logger.LogMsg(String.Format("FxGen: fill {0}x{1} with misc R, G, B colors", this.Geometry.Width, this.Geometry.Height), this.PluginID);
		if (this.m_timestamp - this.m_prevtime >= 500) ++this.m_offset; //force a change at most 2x/sec
		for (int y = 0; y < this.Geometry.Height; ++y)
			for (int x = 0; x < this.Geometry.Width; ++x)
				this.m_gr.FillRectangle(new SolidBrush(colors[1<<((x + y + this.m_offset) % 3)]), x, y, 1, 1);
//		this.m_nextmacro = MyMacros.FillRGBTest; //sticky
		return true; //effect continues until turned off
	}

//fill in a rect one pixel at a time:
//Mainly used for fx debug or hardware testing, but maybe useful as an actual effect so it's still here.
//Fills in client rect one pixel at a time, L->R, B->T, then repeats with another color.
//TODO: add other fill directions?  ChannelMapper can be used to change order.
//	private void FillOneByOne()
//	{
//		GetFgColor(true);
//		int x = this.m_repeated % this.Geometry.Width, y = (this.m_repeated / this.Geometry.Width) % this.Geometry.Height, iter = this.m_repeated / (this.Geometry.Width * this.Geometry.Height);
//		this.m_gr.FillRectangle(new SolidBrush(this.m_fg, x, y, 1, 1);
//		this.m_nextmacro = MyMacros.FillOneByOne; //sticky
//	}

	private void DrawCorners()
	{
		if (Logger.WantTrace) Logger.LogMsg(String.Format("FxGen: corners of {0}x{1}", this.Geometry.Width, this.Geometry.Height), this.PluginID);
		this.m_gr.FillRectangle(new SolidBrush(Color.FromArgb(255, 255, 0, 0)), 0, 0, 1, 1); //top left = red
		this.m_gr.FillRectangle(new SolidBrush(Color.FromArgb(255, 0, 255, 0)), this.Geometry.Width - 1, 0, 1, 1); // top right = green 
		this.m_gr.FillRectangle(new SolidBrush(Color.FromArgb(255, 0, 0, 255)), this.Geometry.Width - 1, this.Geometry.Height - 1, 1, 1); // bottom right = blue
		this.m_gr.FillRectangle(new SolidBrush(Color.FromArgb(255, 255, 255, 255)), 0, this.Geometry.Height - 1, 1, 1); //bottom left = white
		this.m_nextmacro = MyMacros.Noop; //one-shot function
	}

	private int m_speed, m_duration; //, m_opaque;
	private bool Fade()
	{
//		for (int y = 0; y < base.Geometry.Height; ++y)
//			for (int x = 0; x < base.Geometry.Width; ++x)
//				this.m_gr.g.FillRectangle(new SolidBrush(colors[inx++ % colors.Length]), x, y, 1, 1);
//		this.m_next
		if (this.m_repeated < 1)
		{
//			if (duration < 1) return;
			this.m_speed = Math.Min(Math.Max((int)this.HostChannel(this.m_fxchparam, this.m_frame), 1), 128); //.m_seq.EventValues[
			this.m_duration = 256/this.m_speed;
//			this.m_opaque = this.m_delta;
//			this.m_delta += this.m_delta/10; //kludge: seems to need a little more
		}
		if (Logger.WantTrace) Logger.LogMsg(String.Format("fade: rpt {0}, duration {1}, speed {2}", this.m_repeated, this.m_duration, this.m_speed), this.PluginID);
		this.m_gr.FillRectangle(new SolidBrush(Color.FromArgb(this.m_speed, 0, 0, 0)), 0, 0, this.Geometry.Width, this.Geometry.Height);
		this.m_speed += this.m_repeated; //kludge: needs a little more
//		this.m_nextmacro = (this.m_repeated < this.m_duration -1)? MyMacros.Fade: MyMacros.Noop;
		return ((this.m_repeated <= this.m_duration) && (this.m_speed <= 255)); //this.m_nextmacro = MyMacros.Noop;
//		this.m_opaque += this.m_delta;
//TODO: fix fade rate
	}

	private bool Ramp()
	{
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			this.m_speed = Math.Min(Math.Max((int)this.HostChannel(this.m_fxchparam, this.m_frame), 1), 128); //.m_seq.EventValues[
			this.m_duration = 256/this.m_speed;
		}
		if (Logger.WantTrace) Logger.LogMsg(String.Format("ramp: rpt {0}, duration {1}, speed {2}, fg color {3:X}", this.m_repeated, this.m_duration, this.m_speed, this.m_fg), this.PluginID);
//		this.m_gr.FillRectangle(new SolidBrush(Color.FromArgb(this.m_delta, 0, 0, 0)), 0, 0, base.Geometry.Width, base.Geometry.Height);
		this.m_gr.FillRectangle(new SolidBrush(Color.FromArgb(this.m_speed, this.m_fg.R, this.m_fg.G, this.m_fg.B)), 0, 0, this.Geometry.Width, this.Geometry.Height);
		this.m_speed += this.m_repeated; //kludge: needs a little more
		return ((this.m_repeated <= this.m_duration) && (this.m_speed <= 255)); //this.m_nextmacro = MyMacros.Noop;
	}

	private bool LRWipe(bool fill)
	{
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			this.m_speed = this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
		}
		int rpt = /*Math.Floor*/(this.m_repeated/this.m_speed);
		if (Logger.WantTrace) Logger.LogMsg(String.Format("LRwipe: rpt {0}, speed {1}, draw x {2}, y {3}, w {4}, h {5}", this.m_repeated, this.m_speed, rpt % this.m_wh.Width, 0, 1, this.Geometry.Height), this.PluginID);
		if (!fill && (this.m_repeated > 0)) this.m_gr.FillRectangle(new SolidBrush(this.m_bg), /*Math.Floor*/((this.m_repeated - 1)/this.m_speed) % this.m_wh.Width, 0, 1, this.Geometry.Height); //clear prev
		if (rpt >= this.m_wh.Width) return false; //{ this.m_nextmacro = MyMacros.Noop; return; }
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), rpt % this.m_wh.Width, 0, 1, this.Geometry.Height);
		return true;
	}

	private bool MidWipe(bool outward)
	{
		bool fill = true;
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
		}
		int halfw = /*Math.Floor*/(this.m_wh.Width/2), xofs = /*Math.Floor*/(this.m_repeated/this.m_speed), xprevofs = /*Math.Floor*/((this.m_repeated - 1)/this.m_speed);
		if (Logger.WantTrace) Logger.LogMsg(String.Format("Midwipe: rpt {0}, speed {1}, draw x {2}, y {3}, w {4}, h {5}", this.m_repeated, this.m_speed, xofs % this.m_wh.Width, 0, 1, this.Geometry.Height), this.PluginID);
		if (!fill && (this.m_repeated > 0) && (xprevofs != xofs))
		{
			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), (outward? (halfw - xprevofs): xprevofs) % this.m_wh.Width, 0, 1, this.Geometry.Height); //clear prev
			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), (outward? (halfw + xprevofs): (this.m_wh.Width - xprevofs)) % this.m_wh.Width, 0, 1, this.Geometry.Height); //clear prev
		}
		if (xofs > halfw) return false; //{ this.m_nextmacro = MyMacros.Noop; return; }
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), (outward? (halfw - xofs): xofs) % this.m_wh.Width, 0, 1, this.Geometry.Height);
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), (outward? (halfw + xofs): (this.m_wh.Width - xofs)) % this.m_wh.Width, 0, 1, this.Geometry.Height);
		return true;
	}

	private bool BTWipe(bool fill)
	{
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
		}
		int rpt = /*Math.Floor*/(this.m_repeated/this.m_speed);
		if (Logger.WantTrace) Logger.LogMsg(String.Format("Lineup: rpt {0}, speed {1}, draw x {2}, y {3}, w {4}, h {5}", this.m_repeated, this.m_speed, 0, rpt % this.Geometry.Height, this.Geometry.Width, 1), this.PluginID);
		if (!fill && (this.m_repeated > 0)) this.m_gr.FillRectangle(new SolidBrush(this.m_bg), 0, /*Math.Floor*/((this.m_repeated - 1)/this.m_speed) % this.Geometry.Height, this.Geometry.Width, 1); //clear prev
		if (rpt >= this.Geometry.Height) return false; //{ this.m_nextmacro = MyMacros.Noop; return; }
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), 0, /*base.Geometry.Height -*/ rpt % this.Geometry.Height, this.Geometry.Width, 1);
		return true;
	}

	private bool TBWipe(bool fill)
	{
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
		}
		int rpt = /*Math.Floor*/(this.m_repeated/this.m_speed);
		if (Logger.WantTrace) Logger.LogMsg(String.Format("DownWipe: rpt {0}, speed {1}, draw x {2}, y {3}, w {4}, h {5}", this.m_repeated, this.m_speed, 0, rpt % this.Geometry.Height, this.Geometry.Width, 1), this.PluginID);
		if (!fill && (this.m_repeated > 0)) this.m_gr.FillRectangle(new SolidBrush(this.m_bg), 0, this.Geometry.Height -1 - /*Math.Floor*/((this.m_repeated - 1)/this.m_speed) % this.Geometry.Height, this.Geometry.Width, 1); //clear prev
		if (rpt >= this.Geometry.Height) return false; //{ this.m_nextmacro = MyMacros.Noop; return; }
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), 0, /*base.Geometry.Height -*/ this.Geometry.Height -1 - rpt % this.Geometry.Height, this.Geometry.Width, 1);
		return true;
	}

	//diagonal line or fill:
//	private int WrapW(int xofs) { return (xofs + this.m_wh.Width) % this.m_wh.Width; } //add width first to prevent negative numbers
	private bool Spiral(bool fill)
	{
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
			this.m_dir = (this.m_speed & 0x80) != 0;
			this.m_speed &= ~0x80;
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
		}
		GetNextColor(); //update color each frame if specified; allows ramp, fade, or color gradient on text
		int rpt = /*Math.Floor*/(this.m_repeated/this.m_speed);
		int startx = rpt % this.m_wh.Width; //endx = WrapW(startx - 1);
//		int endx = WrapW(startx - 1); ///*Math.Floor*/((this.m_repeated + this.Geometry.Height)/this.m_speed) % this.m_wh.Width;
		if (Logger.WantTrace) Logger.LogMsg(String.Format("Spiral: rpt {0}, speed {1}, start x {2}, w {3}, h {4}", this.m_repeated, this.m_speed, startx, this.m_wh.Width, this.m_wh.Height), this.PluginID);
//draw line in 2 parts (before and after horizontal wrap):
//GDI will clip the invisible part of the line
		int starty = this.m_dir? this.m_wh.Height: 0, endy = this.m_dir? 0: this.m_wh.Height;
		if (!fill && (this.m_repeated > 0)) //blank out prev line
		{
			this.m_gr.DrawLine(new Pen(this.m_bg), startx - 1, starty, startx + this.m_wh.Width - 1, endy); // /*Math.Floor*/((this.m_repeated - 1)/this.m_speed) % this.m_wh.Width, 0, /*Math.Floor*/((this.m_repeated - 1 + this.m_wh.Width)/this.m_speed) % this.m_wh.Width, this.Geometry.Height); //clear prev
			this.m_gr.DrawLine(new Pen(this.m_bg), startx - this.m_wh.Width - 1, starty, startx - 1, endy); // /*Math.Floor*/((this.m_repeated - 1)/this.m_speed) % this.m_wh.Width, 0, /*Math.Floor*/((this.m_repeated - 1 + this.m_wh.Width)/this.m_speed) % this.m_wh.Width, this.Geometry.Height); //clear prev
		}
		this.m_gr.DrawLine(new Pen(this.m_fg), startx, starty, startx + this.m_wh.Width, endy);
		this.m_gr.DrawLine(new Pen(this.m_fg), startx - this.m_wh.Width, starty, startx, endy);
		return true; //forever (rpt < Math.Min(this.m_wh.Width, this.Geometry.Height)); //this.m_nextmacro = MyMacros.Noop;
	}

	//cover up existing nodes one at a time using a spiral pattern:
//	private int m_xprev, m_yprev; //remember previous (x,y)
//	private int m_pathdir; //type/direction of path
	private bool m_erasebkg;
	private bool SpiralXition()
	{
		if (this.m_repeated < 1)
		{
			GetFgColor(true); //save initial color in case not specified later
			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
//			this.m_pathdir = this.m_speed & 0xc0; this.m_speed &= ~0xc0; //kludge: upper bits = path direction/type
			this.m_erasebkg = (this.m_speed & 0x80) != 0; this.m_speed &= ~0x80;
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
//			this.m_xprev = this.m_yprev = 0; //start in lower left corner; TODO: make this selectable? (maybe text tag?)
			this.m_limit = Math.Min(this.Geometry.Width/2, this.Geometry.Height/2); //stop in the middle
		}
		if (Logger.WantTrace) Logger.LogMsg(String.Format("FxGen: spiral xition {0} with {1}", this.m_repeated, this.m_fg.ToString()), this.PluginID);
//		if (this.m_fg.A == 255) // != Color.Transparent) //blank out bkg first
		if (this.m_erasebkg)
			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), this.m_rect);
		GetNextColor(); //update color each frame if specified; allows ramp, fade, or color gradient on sprite
		int rpt = /*Math.Floor*/(this.m_repeated/this.m_speed); //cumulative distance travelled by sprite
		int indent, x = 0, y = 0;
		for (indent = 0; indent <= m_limit; ++indent) //stop in middle
		{
			y = indent;
			if (rpt < Geometry.Width - 2 * indent) { x = rpt + indent;  break; } //sprite is on lower edge of this level
			rpt -= Geometry.Width - 2 * indent -1;
			x = Geometry.Width - indent -1;
			if (rpt < Geometry.Height - 2 * indent) { y = rpt + indent; break; } //sprite is on right edge of this level
			rpt -= Geometry.Height - 2 * indent -1;
//					y = Geometry.Height - indent -1;
			int newy = Geometry.Height - indent -1;
			if (y == newy) return false; //already did this row
			y = newy;
			if (rpt < Geometry.Width - 2 * indent) { x = Geometry.Width - indent - rpt -1; break; } //sprite is coming back along upper edge of this level
			rpt -= Geometry.Width - 2 * indent -1;
			if (x == indent) return false; //already did this column
			x = indent;
			if (rpt < Geometry.Height - 2 * indent -1) { y = Geometry.Height - indent - rpt -1; break; } //sprite is coming back along left edge of this level
			rpt -= Geometry.Height - 2 * indent -1;
		}
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), x, y, 1, 1);
//		this.m_nextmacro = MyMacros.FillOneByOne; //sticky
		return indent <= this.m_limit; //effect continues until turned off or reaches middle
	}

	//up-down zig-zag test:
	private bool GECETest_zzud()
	{
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
		}
		if (Logger.WantTrace) Logger.LogMsg(String.Format("FxGen: fill zzud {0} with {1}", this.m_repeated, this.m_fg.ToString()), this.PluginID);
		int rpt = /*Math.Floor*/(this.m_repeated/this.m_speed);
		int y = rpt % this.Geometry.Height, x = /*Math.Floor*/(rpt / this.Geometry.Height) % this.m_wh.Width, iter = /*Math.Floor*/(rpt / (this.m_wh.Width * this.Geometry.Height));
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), x, y, 1, 1);
//		this.m_nextmacro = MyMacros.FillOneByOne; //sticky
		return true; //effect continues until turned off
	}

	//left-right zig-zag test:
	private bool GECETest_zzlr()
	{
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
		}
		if (Logger.WantTrace) Logger.LogMsg(String.Format("FxGen: fill zzlr {0} with {1}", this.m_repeated, this.m_fg.ToString()), this.PluginID);
		int rpt = /*Math.Floor*/(this.m_repeated/this.m_speed);
		int x = rpt % this.m_wh.Width, y = /*Math.Floor*/(rpt / this.m_wh.Width) % this.Geometry.Height, iter = /*Math.Floor*/(rpt / (this.m_wh.Width * this.Geometry.Height));
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), x, y, 1, 1);
//		this.m_nextmacro = MyMacros.FillOneByOne; //sticky
		return true; //effect continues until turned off
	}
	
	private void DrawRow()
	{
		GetFgColor(true);
		int row = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
		int onrow = row & 0xF, offrow = row >> 4; //max 16 rows for now
		if (Logger.WantTrace) Logger.LogMsg(String.Format("DrawRow: on {0}, off {1}, color {2:X}", onrow, offrow, this.m_fg), this.PluginID);
		if (offrow != onrow) this.m_gr.FillRectangle(new SolidBrush(this.m_bg), 0, offrow, this.Geometry.Width, 1);
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), 0, onrow, this.Geometry.Width, 1);
		this.m_nextmacro = MyMacros.Noop; //one-shot function
	}

	private void DrawColumn(int colofs)
	{
		GetFgColor(true);
		int col = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
		int oncol = (col & 0xF) | (colofs & 1)<<8, offcol = (col >> 4) | (colofs & 2)<<8; //max 32 cols for now
		if (Logger.WantTrace) Logger.LogMsg(String.Format("DrawCol: on {0}, off {1}, color {2:X}", oncol, offcol, this.m_fg), this.PluginID);
		if (offcol != oncol) this.m_gr.FillRectangle(new SolidBrush(this.m_bg), offcol, 0, 1, this.Geometry.Height);
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), oncol, 0, 1, this.Geometry.Height);
		this.m_nextmacro = MyMacros.Noop; //one-shot function
	}

	//chase:
	//useful for M-tree or other props with rows or columns
	//NOTE: this effect remains active until another effect is started
	//any changes to param or color channels take effect for the duration
	//the operation is more like echo than chase, but used with a delay+offset it can be used for chase
//	private int m_startframe; //start frame# of this function
	private int m_nextfx;
	private bool Chase()
	{
		if (this.m_repeated < 1)
		{
			//kludge: use a text frametag rather than defining a bunch of new channel aliases
			//this allows reusing of existing animation attrs
			FrameTag txtnode = FrameTag.ByValue("fxtext", this.HostChannel(this.m_fxchtext, this.m_frame));
			if (txtnode == null) txtnode = FrameTag.ByFrame("fxtext", this.m_frame);
			if (txtnode == null) return false; //nothing to do
			GetAnimation(txtnode); //speed, direction, etc
//			this.m_startframe = this.m_frame; //don't look back before start frame of this effect
			this.m_nextfx = this.m_frame + 1; //assume next effect is at least one frame away
		}
//		GetFgColor(true); //continuous color refresh to allow live color gradients or other color effects
//		int xofs = this.m_ani.xyofs.X + (int)(this.m_repeated * this.m_ani.hscroll.Numerator / this.m_ani.hscroll.Denominator); //- this.m_rect.Width;
//		while (xofs < 0) xofs += 1000 * (wh.Width + this.m_rect.Width); //kludge: keep modulo arith > 0
//		xofs = xofs % (wh.Width + this.m_rect.Width) - wh.Width; //wrap if needed
//		if (this.m_bg.A != 0) // != Color.Transparent) //blank out bkg first
			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), this.m_rect);
		Point xyofs = Animate(new Size(0, 0), true);
		if (Logger.WantTrace) Logger.LogMsg(String.Format("chase: hscroll? {0}/{1}, vscroll? {2}/{3}, loop {4}, xofs {5}, yofs {6}, rpt {7} => xy {8}, {9}", this.m_ani.hscroll.Numerator, this.m_ani.hscroll.Denominator, this.m_ani.vscroll.Numerator, this.m_ani.vscroll.Denominator, this.m_ani.loop, xyofs.X, xyofs.Y, this.m_repeated, xyofs.X, xyofs.Y), this.PluginID);
//		if (Logger.WantTrace) Logger.LogMsg(String.Format("chase ani: xofs {0}, yofs {1}", xyofs.X, xyofs.Y));
		for (int x = 0; x < this.m_wh.Width; ++x)
//			for (int y = 0; y < this.m_wh.Height; ++y)
			{
//				int nextfx = this.HostChannel(this.m_fxchfunc, this.m_frame);
//				int timeofs = this.
				if (Logger.WantTrace) Logger.LogMsg(String.Format("x {0}/{1} + xofs {2} vs. rpt {3}, nextfx {4} = {5}", x, this.m_wh.Width, xyofs.X, this.m_repeated, this.m_nextfx, HostChannel(this.m_fxchfunc, this.m_nextfx)), this.PluginID);
//#if false
				int xofs = this.m_ani.xyofs.X + (int)((this.m_repeated + this.m_wh.Height - xyofs.Y)* this.m_ani.hscroll.Numerator / this.m_ani.hscroll.Denominator); //- this.m_rect.Width;
				while (xofs < 0) xofs += 1000 * (/*wh.Width +*/ this.m_rect.Width); //kludge: keep modulo arith > 0
				xofs = xofs % (/*wh.Width +*/ this.m_rect.Width) /*- wh.Width*/; //wrap if needed
//#endif
				if (x + xyofs.X > this.m_repeated) continue; //don't look back past start of this effect
				if (x + xyofs.X < 0) //look forward, but don't go into next effect
				{
					bool isnextfx = false;
					while (this.m_frame - (x + xyofs.X) >= this.m_nextfx)
						if (HostChannel(this.m_fxchfunc, this.m_nextfx, 255) == 0) ++this.m_nextfx; //didn't look ahead far enough yet
						else { isnextfx = true; break; }
					if (isnextfx) continue; //don't go into next effect
				}
				Color c = GetColorParam(this.m_frame - (x + xyofs.X)); //ARGB channels define shape, look back to get adjacent pixels
				if (Logger.WantTrace) Logger.LogMsg(String.Format("x {0}/{1}, color[{2}] = [{3},{4},{5},{6}], h {7}", x, this.m_wh.Width, this.m_frame - x, c.A, c.R, c.G, c.B, this.Geometry.Height), this.PluginID);
				if (c == this.m_bg) continue;
				this.m_gr.DrawLine(new Pen(c), x + xyofs.X, xyofs.Y, x + xyofs.X + xofs, this.Geometry.Height);
//			this.m_gr.DrawLine(new Pen(this.m_bg), startx - 1, 0, startx + this.m_wh.Width - 1, this.m_wh.Height); // /*Math.Floor*/((this.m_repeated - 1)/this.m_speed) % this.m_wh.Width, 0, /*Math.Floor*/((this.m_repeated - 1 + this.m_wh.Width)/this.m_speed) % this.m_wh.Width, this.Geometry.Height); //clear prev
			}
#if false
		int rpt = /*Math.Floor*/(this.m_repeated/this.m_speed);
		int startx = rpt % this.m_wh.Width; //endx = WrapW(startx - 1);
//draw line in 2 parts (before and after horizontal wrap):
//GDI will clip the invisible part of the line
		this.m_gr.DrawLine(new Pen(this.m_fg), startx, 0, startx + this.m_wh.Width, this.m_wh.Height);
		this.m_gr.DrawLine(new Pen(this.m_fg), startx - this.m_wh.Width, 0, startx, this.m_wh.Height);
#endif
		return true; //remains active until next fx function
	}

	private bool m_dir;
	private bool Swirl(bool ccw)
	{
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
			this.m_dir = ccw;
		}
		int rpt = /*Math.Floor*/(this.m_repeated/this.m_speed);
//		if (fill && (this.m_repeated > 0)) this.m_gr.DrawLine(new Pen(this.m_bg), ((this.m_repeated - 1)/this.m_speed) % base.Geometry.Width, 0, ((this.m_repeated - 1 + base.Geometry.Width)/this.m_speed) % base.Geometry.Width, base.Geometry.Height); //clear prev
//		this.m_gr.DrawLine(new Pen(this.m_fg), (this.m_repeated/this.m_speed) % base.Geometry.Width, 0, ((this.m_repeated + base.Geometry.Height)/this.m_speed) % base.Geometry.Width, base.Geometry.Height);
		int doubleh = 2* this.Geometry.Height, swofs = /*Math.Floor*/(this.m_repeated/this.m_speed) % doubleh, x, y;
		if (Logger.WantTrace) Logger.LogMsg(String.Format("Swirl: rpt {0}, speed {1}, => {2}, ccw {3}, sw ofs {4}", this.m_repeated, this.m_speed, rpt, this.m_dir, swofs), this.PluginID);
		if (ccw) swofs = doubleh - swofs;
		if (swofs < this.Geometry.Height) { x = 0; y = swofs; }
		else { x = this.m_wh.Width / 2 - 3; y = doubleh - 1 - swofs; }
		this.m_gr.FillRectangle(new SolidBrush(this.m_fg), x, y, 3, 1);
		return (rpt <= doubleh); //this.m_nextmacro = MyMacros.Noop;
	}

	private bool Burst()
	{
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
		}
		int rpt = /*Math.Floor*/(this.m_repeated/this.m_speed);
		if (Logger.WantTrace) Logger.LogMsg(String.Format("Burst: burst {0}, speed {1}", this.m_repeated, this.m_speed), this.PluginID);
//		Logger.LogMsg(String.Format("FxGen: border {0}x{1} with {2}", base.Geometry.Width, base.Geometry.Height, colors[inx % colors.Length].ToString()));
//draw border:
//border needs to be slightly smaller than client rect fxea.Rect, which is actual width + height
//		fxea.Graphics.DrawRectangle(new Pen(Brushes.White), fxea.Rect);
		int halfw = /*Math.Floor*/(this.m_wh.Width/2), halfh = /*Math.Floor*/(this.m_wh.Height/2), brofs = /*Math.Floor*/(this.m_repeated/this.m_speed) % halfw;
		if (halfw > 10) halfw = 10; //kludge for partially populated snow globe
//		if (this.m_repeated < 1) this.m_fg = colors[inx % colors.Length];
		if (Logger.WantTrace) Logger.LogMsg(String.Format("FxGen: burst {0}x{1} burst ofs {2} with {3}", this.Geometry.Width, this.Geometry.Height, brofs, this.m_fg.ToString()), this.PluginID);
		Pen pen = new Pen(new SolidBrush(this.m_fg));
		this.m_gr.DrawRectangle(pen, halfw - 1 - brofs, halfh - 1 - brofs, 2 * brofs + 1, 2 * brofs + 1);
//		pen = new Pen(new SolidBrush(Color.FromArgb(255, 255, 0, 255))); //this.m_fg)); //for debug only
		this.m_gr.DrawLine(pen, halfw - 1 - brofs - 1, halfh - 1 - brofs - 1, halfw - 1 - brofs + 0, halfh - 1 - brofs + 0); //kludge: some machines leave a diagonal bkg line (64-bit graphics?)
		return (rpt < halfw); //this.m_nextmacro = MyMacros.Noop;
//		this.m_nextmacro = MyMacros.FillOneByOne; //sticky
	}

	private class Snowflake
	{
		public Color c;
		public int h, x;
		public int age;
	}
//	private List<EqBar> m_eqbars = new List<EqBar>();
	private Snowflake[] m_snflakes = new Snowflake[20];
	private int[] m_snflofs = new int[] {0, 3, 1, 4, 2, 0, 3, 5, 2, 1, 4, 3, 0, 2, 5, 6, 3, 4, 2, 3}; //somewhat random
	private bool m_drip; //flag for drip effect
	private bool Snow() //similar to upside down eq bar; can also be used for drip effect
	{
//TODO: other fx should cancel this one
		if (this.m_repeated < 1) //add more flakes
		{
//			EqBar eq = new EqBar();
			GetFgColor(true);
			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
			this.m_drip = (this.m_speed & 0x80) != 0; this.m_speed &= ~0x80; //top bit = drip flag
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
			if (this.m_fg != this.m_bg) //set fg == bg to stop this fx (auto repeats otherwise)
				for (int inx=0; inx < this.m_snflakes.Length; ++inx)
				{
					if (this.m_snflakes[inx] == null) this.m_snflakes[inx] = new Snowflake();
					this.m_snflakes[inx].c = this.m_fg; //remember color so we can have different color flakes
					this.m_snflakes[inx].x = inx;
					this.m_snflakes[inx].h = this.m_wh.Height;
					this.m_snflakes[inx].age = 0;
					if (inx < this.m_snflofs.Length) this.m_snflakes[inx].h += 2 * this.m_snflofs[inx] + (inx & 1); //somewhat randomized
					this.m_snflakes[inx].h *= this.m_speed;
				}
		}
//		GetFgColor(true);
		bool active = false;
		int vthird = this.m_wh.Height/3, vofs = 1; //TODO: fix this
		for (int i=0; i < this.m_snflakes.Length; ++i)
//			for (int vofs = 0; vofs < 3; ++vofs) //repeat 3x vertically
			{
				if (this.m_snflakes[i] == null) continue;
				int xofs = this.m_snflakes[i].x; //this.m_rect.Width * this.m_snflakes[i].x / 6 + (2 * vofs) % 3
				int width = 1; //this.m_rect.Width/3;
//			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), this.m_snflakes[i].x, this.m_snflakes[i].h + this.m_wh.Height/2, 1, 1); //clear any artifacts from prev instance
				if (!this.m_drip)
				{
					this.m_gr.FillRectangle(new SolidBrush(this.m_bg), xofs, this.m_snflakes[i].h/this.m_speed + vofs*vthird, width, 1); //clear any artifacts from prev instance
					if (Logger.WantTrace) Logger.LogMsg(String.Format("Snflake[{0}/{1}]: (x {2}, y {3}, w {4}, h {5}) => bg color [{6},{7},{8},{9}]", i, this.m_snflakes.Length, xofs, this.m_snflakes[i].h/this.m_speed, width, 1, this.m_bg.A, this.m_bg.R, this.m_bg.G, this.m_bg.B), this.PluginID);
				}
				--this.m_snflakes[i].h;// -= this.m_speed;
				if (this.m_snflakes[i].h >= 0)
				{
					this.m_gr.FillRectangle(new SolidBrush(this.m_snflakes[i].c), xofs, this.m_snflakes[i].h/this.m_speed + vofs*vthird, width, 1);
					if (Logger.WantTrace) Logger.LogMsg(String.Format("Snflake[{0}/{1}]: (x {2}, y {3}, w {4}, h {5}) => fg color [{6},{7},{8},{9}]", i, this.m_snflakes.Length, xofs, this.m_snflakes[i].h/this.m_speed, width, 1, this.m_snflakes[i].c.A, this.m_snflakes[i].c.R, this.m_snflakes[i].c.G, this.m_snflakes[i].c.B), this.PluginID);
					active = true; //active flakes
				}
				else if (this.m_fg != this.m_bg) //repeat this flake
				{
					this.m_snflakes[i].h = this.m_speed * this.m_wh.Height;
					++this.m_snflakes[i].age;
					active = true; //active flakes
				}
			}
		return active; //this.m_nextmacro = MyMacros.Noop;
	}

#if false //icing/drip effect
	private Snowflake[] m_snflakes = new Snowflake[20];
	private int[] m_snflofs = new int[] {0, 3, 1, 4, 2, 0, 3, 5, 2, 1, 4, 3, 0, 2, 5, 6, 3, 4, 2, 3}; //somewhat random
	private bool Drip() //similar to upside down eq bar
	{
//TODO: other fx should cancel this one
		if (this.m_repeated < 1) //add more flakes
		{
//			EqBar eq = new EqBar();
			GetFgColor(true);
			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
			if (this.m_speed == 0) this.m_speed = 1; //{ this.m_nextmacro = MyMacros.Noop; return; }
			if (this.m_fg != this.m_bg) //set fg to bg to stop this fx (auto repeats)
				for (int bar=0; bar < this.m_snflakes.Length; ++bar)
				{
					if (this.m_snflakes[bar] == null) this.m_snflakes[bar] = new Snowflake();
					this.m_snflakes[bar].c = this.m_fg;
					this.m_snflakes[bar].x = bar;
					this.m_snflakes[bar].h = this.m_wh.Height;
					if (bar < this.m_snflofs.Length) this.m_snflakes[bar].h += this.m_snflofs[bar]; //somewhat randomized
				}
		}
		GetFgColor(true);
		bool active = false;
		for (int i=0; i < this.m_snflakes.Length; ++i)
		{
			if (this.m_snflakes[i] == null) continue;
			if (Logger.WantTrace) Logger.LogMsg(String.Format("Snflake[{0}/{1}]: x {2}, h {3}, color {4}", i, this.m_snflakes.Length, this.m_snflakes[i].x, this.m_snflakes[i].h, this.m_snflakes[i].c));
//			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), this.m_snflakes[i].x, this.m_snflakes[i].h + this.m_wh.Height/2, 1, 1); //clear any artifacts from prev instance
			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), this.m_snflakes[i].x, this.m_snflakes[i].h, 1, 1); //clear any artifacts from prev instance
			this.m_snflakes[i].h -= this.m_speed;
			if (this.m_snflakes[i].h >= 0)
			{
//				this.m_gr.FillRectangle(new SolidBrush(this.m_snflakes[i].c), this.m_snflakes[i].x, this.m_snflakes[i].h, 1, 1);
				this.m_gr.FillRectangle(new SolidBrush(this.m_snflakes[i].c), this.m_snflakes[i].x, this.m_snflakes[i].h + this.m_wh.Height/2, 1, 1);
				active = true;
			}
			else if (this.m_fg != this.m_bg) //repeat this flake
			{
				this.m_snflakes[i].h = this.m_wh.Height;
				active = true;
			}
		}
		return active; //) this.m_nextmacro = MyMacros.Noop;
	}
#endif

	private class EqBar
	{
		public Color c;
		public int h, speed, age, x, w;
	}
//	private List<EqBar> m_eqbars = new List<EqBar>();
	private EqBar[] m_eqbars = new EqBar[10];
	private bool EqBars(int bar)
	{
//TODO: hook this up to waveform/fmod; for now, it's just statically animated bars
//TODO: other fx should cancel this one
		if (this.m_repeated < 1) //add another bar
		{
//			EqBar eq = new EqBar();
			if ((bar < 0) || (bar >= this.m_eqbars.Length)) return false;
			if (this.m_eqbars[bar] == null) this.m_eqbars[bar] = new EqBar();
			GetFgColor(true);
			this.m_eqbars[bar].c = this.m_fg;
			int attrs = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
//			if (this.m_eqbars.Count < 1) //first one
//				this.m_speed = attrs;
			this.m_eqbars[bar].h = Math.Min(Math.Max(attrs >> 4, 1), this.m_wh.Height); //bar height = upper nibble
			this.m_eqbars[bar].speed = Math.Max(attrs & 0xF, 1); //{ this.m_nextmacro = MyMacros.Noop; return; } //speed = lower nibble
			this.m_eqbars[bar].h += this.m_eqbars[bar].h % this.m_eqbars[bar].speed; //make it an even multiple for easiler drawing logic
//TODO: attrs for placement, width
			this.m_eqbars[bar].w = this.m_wh.Width/10;
//			if (this.m_eqbars.Count < 1) eq.x = this.m_wh.Width/2; //first one in center
//			else eq.x = this.m_eqbars[this.m_eqbars.Count - 1].x + (((this.m_eqbars.Count & 1) != 0)? -3: 3) * this.m_eqbars.Count; //zig-zag outward; this allows it to be ~ centered before we know the total #bars
			this.m_eqbars[bar].x = /*Math.Floor*/(this.m_wh.Width/2) + (((bar & 1) != 0)? -this.m_eqbars[bar].w-1: this.m_eqbars[bar].w+1) * /*Math.Floor*/((bar + 1)/2);
			this.m_eqbars[bar].age = 0;
//			this.m_eqbars.Add(eq);
		}
		int ybase = 1; //4; //0; //TODO: make this selectable?
		bool active = false;
		for (int i=0; i < this.m_eqbars.Length; ++i)
		{
			if (this.m_eqbars[i] == null) continue;
			if (Logger.WantTrace) Logger.LogMsg(String.Format("Eq[{0}/{1}]: x {2}, h {3}, age {4}, speed {5}, color {6}", i, this.m_eqbars.Length, this.m_eqbars[i].x, this.m_eqbars[i].h, this.m_eqbars[i].age, this.m_eqbars[i].speed, this.m_eqbars[i].c), this.PluginID);
			this.m_eqbars[i].age += this.m_eqbars[i].speed;
			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), this.m_eqbars[i].x, ybase, this.m_eqbars[i].w, this.Geometry.Height); //clear any artifacts from prev instance
			if (Logger.WantTrace) Logger.LogMsg(String.Format("Eqbar[{0}/{1}]: (x {2}, y {3}, w {4}, h {5}) => bg color [{6},{7},{8},{9}]", i, this.m_eqbars.Length, this.m_eqbars[i].x, ybase, this.m_eqbars[i].w, this.Geometry.Height, this.m_bg.A, this.m_bg.R, this.m_bg.G, this.m_bg.B), this.PluginID);
//			if (this.m_eqbars[i].age < this.m_eqbars[i].h)
//				this.m_gr.FillRectangle(new SolidBrush(this.m_eqbars[i].c), this.m_eqbars[i].x, this.m_eqbars[i].age, this.m_eqbars[i].w, this.m_eqbars[i].speed);
//			else if (this.m_eqbars[i].age < 2*this.m_eqbars[i].h)
//				this.m_gr.FillRectangle(new SolidBrush(this.m_bg), this.m_eqbars[i].x, 2 * this.m_eqbars[i].h - this.m_eqbars[i].speed - this.m_eqbars[i].age, this.m_eqbars[i].w, this.m_eqbars[i].speed);
			if (this.m_eqbars[i].age < 2*this.m_eqbars[i].h)
			{
				int h = Math.Max((this.m_eqbars[i].age < this.m_eqbars[i].h)? this.m_eqbars[i].age: 2 * this.m_eqbars[i].h - this.m_eqbars[i].age, 1);
				this.m_gr.FillRectangle(new SolidBrush(this.m_eqbars[i].c), this.m_eqbars[i].x, ybase, this.m_eqbars[i].w, h);
				if (Logger.WantTrace) Logger.LogMsg(String.Format("Eqbar[{0}/{1}]: (x {2}, y {3}, w {4}, h {5}) => fg color [{6},{7},{8},{9}]", i, this.m_eqbars.Length, this.m_eqbars[i].x, ybase, this.m_eqbars[i].w, h, this.m_eqbars[i].c.A, this.m_eqbars[i].c.R, this.m_eqbars[i].c.G, this.m_eqbars[i].c.B), this.PluginID);
				active = true;
			}
			else //show min bar while Eq is still active
			{
				this.m_gr.FillRectangle(new SolidBrush(this.m_eqbars[i].c), this.m_eqbars[i].x, ybase, this.m_eqbars[i].w, 1);
				if (Logger.WantTrace) Logger.LogMsg(String.Format("Eqbar[{0}/{1}]: minh (x {2}, y {3}, w {4}, h {5}) => fg color [{6},{7},{8},{9}]", i, this.m_eqbars.Length, this.m_eqbars[i].x, ybase, this.m_eqbars[i].w, 1, this.m_eqbars[i].c.A, this.m_eqbars[i].c.R, this.m_eqbars[i].c.G, this.m_eqbars[i].c.B), this.PluginID);
			}
//			else { this.m_eqbars.RemoveAt(i); continue; }
		}
		return active; //) this.m_nextmacro = MyMacros.Noop;
	}

//NOTE: this is hard-coded for M-tree channels, relative to M-tree start ch#
	private int[] treech = {22 /*12A*/, 21,20 /*11BA*/, 19,18 /*10BA*/, 17,16 /*9BA*/, 15,14 /*8BA*/, 13,12 /*7BA*/, 11,10 /*6BA*/, 9,8 /*5BA*/, 7,6 /*4BA*/, 5,4 /*3BA*/, 3,2 /*2BA*/, 1,0 /*1BA*/, 23 /*12B*/};
	enum TreeChannels //'source channel#s to echo
	{
		BranchStart = 0,
		BankA_BW = 24, //off=GR/ON=BW BankA
		BankA_RW = 25, //off=GB/ON=RW BankA
		BankB_BW = 26, //off=GR/ON=BW BankB
		BankB_RW = 27, //off=GB/ON=RW BankB
	}
	//echo M-tree channels onto Snow globe grid:
	private int m_treeecho = 0; //tree start channel# (0-based)
	private bool TreeEcho()
	{
		if (this.m_repeated < 1) //start tree echo
		{
//			GetFgColor(true);
			this.m_treeecho = (int)this.HostChannel(this.m_fxchparam, this.m_frame) - 1; //.m_seq.EventValues[
			if (this.m_treeecho == -1) this.m_treeecho = 48 -1; //default to last year's value
//			this.m_drip = (this.m_speed & 0x80) != 0; this.m_speed &= ~0x80; //top bit = drip flag
			if (this.m_treeecho == 0) return false; //nothing to echo
		}
//		if (this.m_fxchecho == -1) return false; //no echo source channels defined
		int colorinxABack, colorinxBFront;
		if (this.HostChannel(this.m_treeecho + (int)TreeChannels.BankA_BW, this.m_frame) == 0) ////off=GR, ON=BW BankA
			colorinxABack = (this.HostChannel(this.m_treeecho + (int)TreeChannels.BankA_RW, this.m_frame) == 0)? 2: 1; //off=GB, ON=RW BankA
		else
			colorinxABack = (this.HostChannel(this.m_treeecho + (int)TreeChannels.BankA_RW, this.m_frame) == 0)? 4: 7; //off=GB, ON=RW BankA
		if (this.HostChannel(this.m_treeecho + (int)TreeChannels.BankB_BW, this.m_frame) == 0) ////off=GR, ON=BW BankA
			colorinxBFront = (this.HostChannel(this.m_treeecho + (int)TreeChannels.BankB_RW, this.m_frame) == 0)? 2: 1; //off=GB, ON=RW BankA
		else
			colorinxBFront = (this.HostChannel(this.m_treeecho + (int)TreeChannels.BankB_RW, this.m_frame) == 0)? 4: 7; //off=GB, ON=RW BankA
		int trofs = (24 - this.m_wh.Width)/2; //20 W => drop 2 each side; 16 W => drop 4 each side
//		trofs += this.HostChannel(this.m_fxchparam, this.m_frame); //allow offset
		if (Logger.WantTrace) Logger.LogMsg(String.Format("echo: color A {0}, B {1}, tr ofs {2}", colorinxABack, colorinxBFront, trofs), this.PluginID);
//		this.m_gr.FillRectangle(new SolidBrush(colors[0]), 0, 0, base.Geometry.Width, base.Geometry.Height); //clear bkg first
#if true
		for (int x=0; x<this.m_wh.Width; ++x)
		{
			Color treec = Color.FromArgb(255, 0, 0, 0);
//			string desc = "none";
//			if ((x + trofs >= 0) && (x + trofs < 24))
			{
				int brofs = (x + trofs + 480) % 24; // force positive
				byte trbranch = this.HostChannel(this.m_treeecho + (int)TreeChannels.BranchStart + treech[brofs], this.m_frame); //GetFrameChannel(x + 48, true);
//				desc = String.Format("{0} on? {1}", treech[x + trofs], trbranch);
				if (trbranch != 0)
				{
					treec = colors[((brofs <= 4) || (brofs >= 17))? colorinxABack: colorinxBFront];
					treec = Color.FromArgb(255, (treec.R != 0)? trbranch: 0, (treec.G != 0)? trbranch: 0, (treec.B != 0)? trbranch: 0);
//					desc = String.Format("{0} on-color {1}", desc, treec.ToString());
				}
			}
//			Logger.LogMsg(String.Format("echo: tree[{0}/{1}]: ch inx {2}", x, this.Geometry.Width, desc));
			this.m_gr.FillRectangle(new SolidBrush(treec), x, 0, 1, this.Geometry.Height);
		}
#else
		if (this.m_wh.Width == 16)
		{
			byte tree = this.HostChannel(this.m_treeecho + TreeChannels.BranchStart + 3, this.m_frame);
			this.m_gr.FillRectangle(new SolidBrush(treec), x, 0, 1, this.Geometry.Height);
		}
#endif
//		this.m_nextmacro = MyMacros.Echo; //sticky
		return true; //effect continues until turned off
	}

	//echo 1 channel to many:
	//this allows single channels (strings or pixels) to control multiple strings or nodes
	//useful for face animation or replacing a string-based prop with a node-based prop
	//format: ch# = (X1 - X2, Y1 - Y2), ...
	//TODO: change this to polygon list
	private static Regex chranges = new Regex("(^|(?<=;)) (#) = \\( (#)( - (#))? , (#)( - (#))? \\) ((?=;)|$)".Replace("#", "\\d+").Replace(" ", "\\s*")); //NOTE: this is a little sloppy; it will allow some invalid variations, but it catches most of them
	//NOTE: look-ahead/behind don't count in captured string index
//	private static Regex chranges = new Regex("(#)".Replace("#", "\\d+").Replace(" ", "\\s*")); //NOTE: this is a little sloppy; it will allow some invalid variations, but it catches most of them
	private Dictionary<int, List<Rectangle>> m_echolist = new Dictionary<int, List<Rectangle>>();
	private bool One2Many()
	{
		if (this.m_repeated < 1) //start effect
		{
			this.m_echolist.Clear();
//			GetFgColor(true);
			if (this.m_fxchtext == -1) return false; //nowhere to get text
			FrameTag txtnode = FrameTag.ByValue("fxtext", this.HostChannel(this.m_fxchtext, this.m_frame));
//			if (Logger.WantTrace) Logger.LogMsg(String.Format("tag by val? {0}", txtnode != null));
			if (txtnode == null) txtnode = FrameTag.ByFrame("fxtext", this.m_frame);
//			if (Logger.WantTrace) Logger.LogMsg(String.Format("tag by frame? {0}", txtnode != null));
			if (txtnode == null) return false; //no text to display
			string listtxt = (txtnode != null)? txtnode.TagNode.InnerText/*.Replace("\r\n", ControlChars.CrLf)*/: String.Empty;
			if (Logger.WantTrace) Logger.LogMsg(String.Format("One2Many: ch list {0}, regex {1}, {2} matches", listtxt, chranges.ToString(), chranges.Matches(listtxt).Count), this.PluginID);
			foreach (Match range in chranges.Matches(listtxt))
			{
				if (Logger.WantTrace) Logger.LogMsg(String.Format("One2Many: match {0}: [2] {1} [3] {2} [5] {3} [6] {4} [8] {5}", range.Index, range.Groups[2].Value, range.Groups[3].Value, range.Groups[5].Value, range.Groups[6].Value, range.Groups[8].Value), this.PluginID);
				List<Rectangle> rectlist;
				int chalias = int.Parse(range.Groups[2].Value);
				int rect_Left = int.Parse(range.Groups[3].Value), rect_Right;
				int rect_Bottom = int.Parse(range.Groups[6].Value), rect_Top;
				if (!int.TryParse(range.Groups[5].Value, out rect_Right)) rect_Right = rect_Left;
				if (!int.TryParse(range.Groups[8].Value, out rect_Top)) rect_Top = rect_Bottom;
				if (!this.m_echolist.TryGetValue(chalias, out rectlist)) rectlist = new List<Rectangle>();
				rectlist.Add(new Rectangle(rect_Left, rect_Bottom, rect_Right - rect_Left + 1, rect_Top - rect_Bottom + 1));
				if (rectlist.Count == 1) this.m_echolist.Add(chalias, rectlist);
				if (Logger.WantTrace) Logger.LogMsg(String.Format("One2Many: channel[{0}] {1} now has {2} ranges, latest was rect ({3},{4})..({5},{6})", this.m_echolist.Count, chalias, rectlist.Count, rect_Left, rect_Bottom, rect_Right, rect_Top), this.PluginID);
			}
			if (this.m_echolist.Count < 1) throw new Exception(String.Format("No channel ranges found in '{0}'", listtxt));
//			if (this.m_fxchecho == -1) return false; //nowhere to get echo info
//	private int m_rdiff, m_gdiff, m_bdiff, m_gradlen;
//	private void SetGradient(int gradlen)
//	private Color GetGradient(int timeofs)
//			int attrs = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
//			this.m_echo = (int)this.HostChannel(this.m_fxchecho, this.m_frame); //.m_seq.EventValues[
		}
		this.m_gr.FillRectangle(new SolidBrush(this.m_bg), 0, 0, this.Geometry.Width, this.Geometry.Height); //clear prev
//		foreach (KeyValuePair<Int32, List<Rectangle>> keyval in this.m_echolist.Count)
//		for (int i = 0; i < this.m_echolist.Count; ++i)
		bool gotcolor = false;
		foreach (int key in this.m_echolist.Keys)
		{
			KeyValuePair<int, List<Rectangle>> keyval = new KeyValuePair<int, List<Rectangle>>(key, this.m_echolist[key]); //this.m_echolist.Keys[i], this.m_echolist.Values[i]);
			byte chval = this.HostChannel(keyval.Key, this.m_frame);
//TODO: lock canvas and turn on a bunch of pixels?
			if (chval == 0) continue;
			if (!gotcolor) GetFgColor(true); //get current color each frame
			gotcolor = true;
			Color c = ShadeBtwn(chval);
//			Pen pen = new Pen(new SolidBrush(c));
			Brush br = new SolidBrush(c);
			if (Logger.WantTrace) Logger.LogMsg(String.Format("One2Many: ch {0} val {1} => color [{2},{3},{4},{5}], fill {6} rects", keyval.Key, chval, c.A, c.R, c.G, c.B, keyval.Value.Count), this.PluginID);
			foreach (Rectangle rect in keyval.Value)
//TODO				this.m_gr.FillPolygon 
				this.m_gr.FillRectangle(br, rect);
		}
//			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), 0, 0, this.Geometry.Width, this.Geometry.Height); //clear prev
//			this.m_gr.DrawLine(new Pen(this.m_bg), startx - 1, 0, startx + this.m_wh.Width - 1, this.m_wh.Height); // /*Math.Floor*/((this.m_repeated - 1)/this.m_speed) % this.m_wh.Width, 0, /*Math.Floor*/((this.m_repeated - 1 + this.m_wh.Width)/this.m_speed) % this.m_wh.Width, this.Geometry.Height); //clear prev
		return true; //stays active until next fx
	}

	private Color ShadeBtwn(byte val) { return ShadeBtwn(this.m_bg, this.m_fg, val); }
	private Color ShadeBtwn(Color from, Color to, byte val)
	{
		return Color.FromArgb(255, from.R + val * (to.R - from.R) / 255, from.G + val * (to.G - from.G) / 255, from.B + val * (to.B - from.B) / 255);
	}
			
#if true
	private bool EchoFloods(byte[] frbuf, int stofs) //Vixen.EventSequence seq, int frame, int chofs, byte[] frbuf)
	{
		int where = 0;
		try{
//		if (frame < 0) return false; //eof?
			if (Logger.WantTrace) Logger.LogMsg(String.Format("EchoFloods[{0}]: echoing {1} channels from ofs {2} to {3}+{4}, of {5}x{6} channel values to {7} frame buf", this.m_frame, this.m_fxchecho[2], this.m_fxchecho[0], this.m_fxchecho[1], stofs, ((Vixen.EventSequence)this.VixenInfo.Seq).EventValues.GetUpperBound(0), ((Vixen.EventSequence)this.VixenInfo.Seq).EventValues.GetUpperBound(1), frbuf.GetUpperBound(0)), this.PluginID);
		if ((this.m_fxchecho[0] == -1) || (this.m_fxchecho[1] == -1) || (this.m_fxchecho[2] == -1)) return false; //nothing to echo
		bool dirty = false;
//		StringBuilder sb = new StringBuilder();
		where = 1;
		for (int chofs = 0; chofs < this.m_fxchecho[2]; ++chofs) //0; ch < (int)MyVirtChannels.FloodNumch; ++ch)
		{
			where = 2;
			byte isnow = frbuf[stofs + this.m_fxchecho[1] + chofs]; //this.HostChannel(this.m_fxchecho[1] + chofs, this.m_frame); //frbuf[(int)MyVirtChannels.FloodChofs + ch];
			where = 3;
			byte shouldbe = this.HostChannel(this.m_fxchecho[0] + chofs, this.m_frame); //seq.EventValues[chofs + (int)MyVirtChannels.FloodIn + ch /*(15 - ch)*/, frame]; //whoops; got them backward in profile
			where = 4;
//			sb.AppendFormat(", is '{0}={1} vs. should '{2}={3}", MyVirtChannels.FloodChofs + ch, isnow, chofs + ch, shouldbe);
			if (isnow == shouldbe) continue;
			frbuf[stofs + this.m_fxchecho[1] + chofs] = shouldbe;
//			frbuf[(int)MyVirtChannels.FloodChofs + ch] = shouldbe;
			where = 5;
			dirty = true;
		}
//		FxGen_21.Logger.LogMsg(String.Format("Echo Floods: {0}, dirty? {1}", sb.ToString().Substring(2), dirty));
		where = 6;
		return dirty;
		}catch(Exception exc){
		Logger.ReportError(String.Format("EchoFloods {0}@{1}", this.m_frame, where), exc, this.PluginID); //allow other fx to run
		return false;
	}}
#endif

	public struct TextInfo
	{
		public MyFont font;
		public Size txtwh;
		public string text; //, m_fontdesc = null;
		public TextInfo(object dummy) { font = null; txtwh = new Size(0, 0); text = String.Empty; }
	}
	private TextInfo m_textinfo = new TextInfo(null);
//	private bool m_linebyline;
//	private Color m_BgColor = Color.FromArgb(255, 0, 0, 0) /*.Transparent*/, m_FgColor = Color.FromArgb(255, 255, 0, 0);
	private bool ShowText() //, string fontdesc)
	{
		if (this.m_repeated < 1) //start
		{
			if (Logger.WantTrace) Logger.LogMsg(String.Format("{0} fx: text ch {1}, val {2}", this.m_fxpanelname, this.m_fxchtext, this.HostChannel(this.m_fxchtext, this.m_frame)), this.PluginID);
			if (this.m_fxchtext == -1) return false; //nowhere to get text
			FrameTag txtnode = FrameTag.ByValue("fxtext", this.HostChannel(this.m_fxchtext, this.m_frame));
//			if (Logger.WantTrace) Logger.LogMsg(String.Format("tag by val? {0}", txtnode != null));
			if (txtnode == null) txtnode = FrameTag.ByFrame("fxtext", this.m_frame);
//			if (Logger.WantTrace) Logger.LogMsg(String.Format("tag by frame? {0}", txtnode != null));
			if (txtnode == null) return false; //no text to display
			this.m_textinfo.text = (txtnode != null)? txtnode.TagNode.InnerText/*.Replace("\r\n", ControlChars.CrLf)*/: String.Empty;
			string fontdesc = FrameTag.SafeValue(txtnode.TagNode.Attributes["font"]);
			if (Logger.WantTrace) Logger.LogMsg(String.Format("{0} fx: text {1}, font {2}", this.m_fxpanelname, this.m_textinfo.text, fontdesc), this.PluginID);
//			string fontdesc = String.Format("Arial {0}", this.Geometry.Height - 2); //TODO: make fontdesc, bg + fg colors settable parameters
//			fontdesc = "5x7font";
//			if (String.IsNullOrEmpty(text)) return; //'no change to frame buffer (pass-thru)
//			this.m_bmp = new Bitmap(System.IO.Path.Combine(myfolder, String.Format("{0}font.bmp", face)));
			GetFgColor(true);
			GetAnimation(txtnode); //, this.m_textinfo.txtwh); //speed, direction, etc
			if (Logger.WantTrace) Logger.LogMsg(String.Format("got hscroll? {0}/{1}, vscroll? {2}/{3}, loop {4}", this.m_ani.hscroll.Numerator, this.m_ani.hscroll.Denominator, this.m_ani.vscroll.Numerator, this.m_ani.vscroll.Denominator, this.m_ani.loop), this.PluginID);
//			this.m_fontdesc = fontdesc;
			this.m_textinfo.font = new MyFont(fontdesc, this.GetBitmap);
//get text bounding box to limit scroll duration:
			this.m_textinfo.txtwh = this.m_textinfo.font.DrawText(this.m_gr, this.m_textinfo.text, this.m_bg, this.m_bg, this.m_rect, this.Canvas, false);
//			this.m_textinfo.text += this.m_textinfo.text; //allow text to wrap
			if (this.m_textinfo.font == null) throw new Exception(String.Format("Font '{0}' not found", fontdesc));
//			this.m_speed = Math.Max((int)this.HostChannel(this.m_fxchparam, this.m_frame), (byte)1); //.m_seq.EventValues[
//			this.m_linebyline = (this.m_speed & 0x80) != 0;
//			this.m_linebyline = false; //TODO: needs work
//			this.m_loop = (this.m_speed & 0x80) != 0;
//			this.m_speed &= ~0x80;
		}
//		if (Logger.WantTrace) Logger.LogMsg(String.Format("Text: frame {0}, rpt {1}, text {2}:{3} font {4}", this.m_frame, this.m_repeated, SafeStrlen(this.m_text), String.IsNullOrEmpty(this.m_text)? String.Empty: this.m_text, fontdesc));

//		if (this.m_font == null) //load low-res bitmap or Windows font
//		{
//			this.m_font = new MyFont(this.m_fontdesc, this.GetBitmap);
//			if (this.m_font == null) throw new Exception(String.Format("Font '{0}' not found", this.m_fontdesc));
//		}
		GetNextColor(); //update color each frame if specified; allows ramp, fade, or color gradient on text
		Point xyofs = Animate(this.m_textinfo.txtwh, true);
		if (this.m_bg.A != 0) // != Color.Transparent) //blank out bkg first
			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), this.m_rect);
		if (Logger.WantTrace) Logger.LogMsg(String.Format("text ani: tail visible? xofs {0} + txtw {1} {2}> 0, yofs {3} + txth {4} {5}> 0", xyofs.X, this.m_textinfo.txtwh.Width, (xyofs.X + this.m_textinfo.txtwh.Width > 0)? "": "!", xyofs.Y, this.m_textinfo.txtwh.Height, (xyofs.Y + this.m_textinfo.txtwh.Height > 0)? "": "!"), this.PluginID);
		if (Logger.WantTrace) Logger.LogMsg(String.Format("text ani: head visible? xofs {0} {1}< w {2}, yofs {3} {4}< h {5}", xyofs.X, (xyofs.X < this.m_rect.Width)? "": "!", this.m_rect.Width, xyofs.Y, (xyofs.Y < this.m_rect.Height)? "": "!", this.m_rect.Height), this.PluginID);
//NOTE: text may need to be drawn 2x: head portion towards right/bottom of panel, and tail portion in upper/left region if text wrapped
		if (((xyofs.X < 0) && (xyofs.X + this.m_textinfo.txtwh.Width > 0)) || ((xyofs.Y < 0) && (xyofs.Y + this.m_textinfo.txtwh.Height > 0))) //tail visible
		{
			this.m_textinfo.font.DrawText(this.m_gr, this.m_textinfo.text, this.m_bg, this.m_fg, new Rectangle(this.m_rect.Left +xyofs.X, this.m_rect.Top + this.m_rect.Height - (int)this.m_textinfo.txtwh.Height - xyofs.Y, this.m_rect.Width, this.m_rect.Height + xyofs.Y), this.Canvas, false);
			if (Logger.WantTrace) Logger.LogMsg(String.Format("show text tail: frame {0}, rect ({1}+{2}={3}, {4}+{5}-{6}-{7}={8}, {9}, {10}), txtwh {11}x{12}, repeated {13}/{14}", this.m_frame, this.m_rect.Left, xyofs.X, this.m_rect.Left + xyofs.X, this.m_rect.Top, this.m_rect.Height, this.m_textinfo.txtwh.Height, xyofs.Y, this.m_rect.Top + this.m_rect.Height - this.m_textinfo.txtwh.Height - xyofs.Y, this.m_rect.Width, this.m_rect.Height + xyofs.Y, this.m_textinfo.txtwh.Width, this.m_textinfo.txtwh.Height, this.m_repeated, this.m_ani.loop), this.PluginID);
		}
		if ((xyofs.X >= 0) && (xyofs.X < this.m_rect.Width) && (xyofs.Y >= 0) && (xyofs.Y < this.m_rect.Height)) //head visible
		{
			this.m_textinfo.font.DrawText(this.m_gr, this.m_textinfo.text, this.m_bg, this.m_fg, new Rectangle(this.m_rect.Left +xyofs.X, this.m_rect.Top + this.m_rect.Height - (int)this.m_textinfo.txtwh.Height - xyofs.Y, this.m_rect.Width /*+ xyofs.X*/, this.m_rect.Height + xyofs.Y), this.Canvas, false);
			if (Logger.WantTrace) Logger.LogMsg(String.Format("show text head: frame {0}, rect ({1}+{2}={3}, {4}+{5}-{6}-{7}={8}, {9}, {10}), txtwh {11}x{12}, repeated {13}/{14}", this.m_frame, this.m_rect.Left, xyofs.X, this.m_rect.Left + xyofs.X, this.m_rect.Top, this.m_rect.Height, this.m_textinfo.txtwh.Height, xyofs.Y, this.m_rect.Top + this.m_rect.Height - this.m_textinfo.txtwh.Height - xyofs.Y, this.m_rect.Width, this.m_rect.Height + xyofs.Y, this.m_textinfo.txtwh.Width, this.m_textinfo.txtwh.Height, this.m_repeated, this.m_ani.loop), this.PluginID);
		}
		if (this.m_ani.loop == -1) return true; //forever
		return (this.m_ani.loop-- > 0);
	}

	private int /*m_sttime,*/ m_limit;
	private bool Countdown() //, string fontdesc)
	{
		string fontdesc = "";
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			FrameTag txtnode = FrameTag.ByValue("fxtext", this.HostChannel(this.m_fxchtext, this.m_frame));
			if (txtnode == null) txtnode = FrameTag.ByFrame("fxtext", this.m_frame);
			if (txtnode == null) fontdesc = ""; //default font
			else
			{
				this.m_textinfo.text = (txtnode != null)? txtnode.TagNode.InnerText: String.Empty;
				fontdesc = FrameTag.SafeValue(txtnode.TagNode.Attributes["font"]);
				if (Logger.WantTrace) Logger.LogMsg(String.Format("{0} fx: text {1}, font {2}", this.m_fxpanelname, this.m_textinfo.text, fontdesc), this.PluginID);
			}
			this.m_textinfo.font = new MyFont(fontdesc, this.GetBitmap);
			if (this.m_textinfo.font == null) throw new Exception(String.Format("Font '{0}' not found", fontdesc));
			GetAnimation(txtnode); //, this.m_textinfo.txtwh); //speed, direction, etc; hscroll used for counter speed
			this.m_limit = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //0 for up, !0 for down
//			this.m_speed = this.m_limit & 7;
//			this.m_limit >>= 3;
//			if (this.m_limit != 0) this.m_speed = -this.m_speed;
//			this.m_sttime = Logger.Elapsed();
//			this.m_speed = 1000/((Vixen.EventSequence)this.VixenInfo.Seq).EventPeriod; //hard-coded at 1 sec for now
//			if (this.m_limit != 0) this.m_speed = -this.m_speed; //count down from initial value instead of up from 0
			if (this.m_ani.hscroll.Numerator == 0) //default to 1 sec interval
			{
				this.m_ani.hscroll.Numerator = ((Vixen.EventSequence)this.VixenInfo.Seq).EventPeriod;
				this.m_ani.hscroll.Denominator = 1000;
			}
			this.m_ani.hscroll.Numerator = ((this.m_limit > 0)? -1: 1) * Math.Abs(this.m_ani.hscroll.Numerator); //count down
//get text bounding rect:
			this.m_textinfo.text = (this.m_limit != 0)? this.m_limit.ToString(): "XX"; //assume 2 digits on up count
			this.m_textinfo.txtwh = this.m_textinfo.font.DrawText(this.m_gr, this.m_textinfo.text, this.m_bg, this.m_bg, this.m_rect, this.Canvas, false);
		}
		int rpt = this.m_repeated * this.m_ani.hscroll.Numerator / this.m_ani.hscroll.Denominator; //Math.Abs(this.m_speed);
//		if (this.m_speed < 0) rpt = -rpt;
		string text = String.Format("{0}", this.m_limit + rpt);
		while (text.Length < this.m_textinfo.text.Length) text = text.Insert(0, " "); //left-pad for consistent horizontal alignment
//		int next = Logger.Elapsed() - this.m_sttime;
//		if (next == this.m_prev) return; //no change
//		if (Logger.WantTrace) Logger.LogMsg(String.Format("Text: frame {0}, rpt {1}, text {2}:{3} font {4}", this.m_frame, this.m_repeated, SafeStrlen(this.m_text), String.IsNullOrEmpty(this.m_text)? String.Empty: this.m_text, fontdesc));
		if (this.m_bg.A != 0) // != Color.Transparent) //blank out bkg first
			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), this.m_rect);

//		SizeF txtwh = this.m_textinfo.font.DrawText(this.m_gr, text, this.m_bg, this.m_bg, this.m_rect, this.Canvas, false);
//		int vofs = (int)(this.m_wh.Height - txtwh.Height)/2; //centered
//		int hofs = (int)(this.m_wh.Width - txtwh.Width)/2; //centered
		if (Logger.WantTrace) Logger.LogMsg(String.Format("draw text {0}, h/v ofs {1},{2}, limit {3}, rpt {4}, repeated {5}, speed {6}/{7}", text, this.m_ani.xyofs.X, this.m_ani.xyofs.Y, this.m_limit, rpt, this.m_repeated, this.m_ani.hscroll.Numerator, this.m_ani.hscroll.Denominator), this.PluginID);
//		this.m_textinfo.font.DrawText(this.m_gr, text, this.m_bg, this.m_fg, new Rectangle(hofs, vofs, this.m_rect.Width, this.m_rect.Height), this.Canvas, false);
		this.m_textinfo.font.DrawText(this.m_gr, text, this.m_bg, this.m_fg, new Rectangle(this.m_rect.Left + this.m_ani.xyofs.X, this.m_rect.Top + this.m_rect.Height - (int)this.m_textinfo.txtwh.Height - this.m_ani.xyofs.Y, this.m_rect.Width, this.m_rect.Height), this.Canvas, false);
		return ((this.m_ani.hscroll.Numerator >= 0) || (this.m_limit + rpt >= 0)); //this.m_nextmacro = MyMacros.Noop; //auto-stop on count-down only
	}

	private bool Timer() //, string fontdesc)
	{
		string fontdesc = "";
		if (this.m_repeated < 1)
		{
			GetFgColor(true);
			FrameTag txtnode = FrameTag.ByValue("fxtext", this.HostChannel(this.m_fxchtext, this.m_frame));
			if (txtnode == null) txtnode = FrameTag.ByFrame("fxtext", this.m_frame);
			if (txtnode == null) fontdesc = ""; //default font
			else
			{
				this.m_textinfo.text = (txtnode != null)? txtnode.TagNode.InnerText: String.Empty;
				fontdesc = FrameTag.SafeValue(txtnode.TagNode.Attributes["font"]);
				if (Logger.WantTrace) Logger.LogMsg(String.Format("{0} fx: text {1}, font {2}", this.m_fxpanelname, this.m_textinfo.text, fontdesc), this.PluginID);
			}
			this.m_textinfo.font = new MyFont(fontdesc, this.GetBitmap);
			if (this.m_textinfo.font == null) throw new Exception(String.Format("Font '{0}' not found", fontdesc));
			GetAnimation(txtnode); //, this.m_textinfo.txtwh); //speed, direction, etc; only ofs and hscroll sign used
//			this.m_speed = (int)this.HostChannel(this.m_fxchparam, this.m_frame); //.m_seq.EventValues[
//			this.m_dir = (this.m_speed & 0x80) != 0;
//			this.m_speed &= ~0x80;
//			this.m_sttime = Logger.Elapsed();
//get text bounding rect:
			this.m_textinfo.text = (this.m_limit != 0)? this.m_limit.ToString(): "X:XX"; //assume 3 digits
			this.m_textinfo.txtwh = this.m_textinfo.font.DrawText(this.m_gr, this.m_textinfo.text, this.m_bg, this.m_bg, this.m_rect, this.Canvas, false);
		}
		int hr, min;
		if (this.m_ani.hscroll.Numerator >= 0) //count up
			if (DateTime.Now.Hour == 11) { hr = DateTime.Now.Minute; min = DateTime.Now.Second; }
			else { hr = DateTime.Now.Hour; min = DateTime.Now.Minute; }
		else //count down
			if (DateTime.Now.Hour == 23) { hr = 59 - DateTime.Now.Minute; min = 60 - DateTime.Now.Second; }
		else { hr = 23 - DateTime.Now.Hour; min = 60 - DateTime.Now.Minute; }

		if (this.m_bg.A != 0) // != Color.Transparent) //blank out bkg first
			this.m_gr.FillRectangle(new SolidBrush(this.m_bg), this.m_rect);
		string text = String.Format("{0}:{1:D2}", hr, min); //"{0}:{1:D2}"
		while (text.Length < this.m_textinfo.text.Length) text = text.Insert(0, " "); //left-pad for consistent horizontal alignment

//this.ChannelMapper.Logger.LogMsg(String.Format("draw text {0}, rect {1},{2}, {3},{4}, loc {5},{6}, size {7},{8}", this.m_text, fxea.Rect.Left, fxea.Rect.Top, fxea.Rect.Width, fxea.Rect.Height, this.Location.X, this.Location.Y, this.Size.Width, this.Size.Height));
//		SizeF txtwh = this.m_textinfo.font.DrawText(this.m_gr, text, this.m_bg, this.m_bg, this.m_rect, this.Canvas, false);
//		int vofs = (int)(this.Geometry.Height - txtwh.Height)/2; //centered
//		int hofs = (int)(this.m_wh.Width - txtwh.Width)/2;
//		this.m_textinfo.font.DrawText(this.m_gr, text, this.m_bg, this.m_fg, new Rectangle(hofs, vofs, this.m_rect.Width, this.m_rect.Height), this.Canvas, false);
		this.m_textinfo.font.DrawText(this.m_gr, text, this.m_bg, this.m_fg, new Rectangle(this.m_rect.Left + this.m_ani.xyofs.X, this.m_rect.Top + this.m_rect.Height - (int)this.m_textinfo.txtwh.Height - this.m_ani.xyofs.Y, this.m_rect.Width, this.m_rect.Height), this.Canvas, false);
		return true; //effect continues until turned off
	}

//helpers:
	private Color GetColorParam(int frame)
	{
		return Color.FromArgb(this.HostChannel(this.m_fxchcolor[0], frame), this.HostChannel(this.m_fxchcolor[1], frame), this.HostChannel(this.m_fxchcolor[2], frame), this.HostChannel(this.m_fxchcolor[3], frame));
	}
	private Color GetNextColor()
	{
		Color newcolor = GetColorParam(this.m_frame);
		//if (Logger.WantTrace) Logger.LogMsg(String.Format("GetNextColor: got [{0},{1},{2},{3}] == bg [{4},{5},{6},{7}] ? {8}, fg [{9},{10},{11},{12}]", newcolor.A, newcolor.R, newcolor.G, newcolor.B, this.m_bg.A, this.m_bg.R, this.m_bg.G, this.m_bg.B, newcolor == this.m_bg, this.m_fg.A, this.m_fg.R, this.m_fg.G, this.m_fg.B));
		if (newcolor.A != 0) this.m_fg = newcolor; //update fg color if new one specified
		return this.m_fg;
	}
	private Color GetFgColor(bool refresh)
	{
		if (refresh) this.m_fg = GetColorParam(this.m_frame);
		return this.m_fg;
	}

	//set color gradient limits:
	private int m_rdiff, m_gdiff, m_bdiff, m_gradlen;
	private void SetGradient(int gradlen)
	{
		this.m_gradlen = (gradlen <= 0)? 1: gradlen;
		this.m_rdiff = (this.m_fg.R - this.m_bg.R)/this.m_gradlen;
		this.m_gdiff = (this.m_fg.G - this.m_bg.G)/this.m_gradlen;
		this.m_bdiff = (this.m_fg.B - this.m_bg.B)/this.m_gradlen;
		this.m_gradlen /= 2;
	}
	private Color GetGradient(int timeofs)
	{
		double rgrad, ggrad, bgrad;
//'NOTE: simple RGB fractions of (end - start) * position-within-timespan seem too dark.
//'To compensate, try to keep brightness and saturation level and just alter hue.
//' 		rgrad = CInt(Me.m_gradstartcolor.R) + (frame - Me.m_gradstartframe) * Me.m_rdiff / Me.m_gradlen
//'		ggrad = CInt(Me.m_gradstartcolor.G) + (frame - Me.m_gradstartframe) * Me.m_gdiff / Me.m_gradlen
//'		bgrad = CInt(Me.m_gradstartcolor.B) + (frame - Me.m_gradstartframe) * Me.m_bdiff / Me.m_gradlen
		if (this.m_rdiff > 0) //'increase during first half of timespan
			rgrad = (int)this.m_bg.R + Math.Min(timeofs, this.m_gradlen) * this.m_rdiff / this.m_gradlen;
		else //'decrease during second half of timespan
			rgrad = (int)this.m_bg.R + Math.Max(timeofs - this.m_gradlen, 0) * this.m_rdiff / this.m_gradlen;
		if (this.m_gdiff > 0) //'increase during first half of timespan
			ggrad = (int)this.m_bg.G + Math.Min(timeofs, this.m_gradlen) * this.m_gdiff / this.m_gradlen;
		else //'decrease during second half of timespan
			ggrad = (int)this.m_bg.G + Math.Max(timeofs - this.m_gradlen, 0) * this.m_gdiff / this.m_gradlen;
		if (this.m_bdiff > 0) //'increase during first half of timespan
			bgrad = (int)this.m_bg.B + Math.Min(timeofs, this.m_gradlen) * this.m_bdiff / this.m_gradlen;
		else //'decrease during second half of timespan
			bgrad = (int)this.m_bg.B + Math.Max(timeofs - this.m_gradlen, 0) * this.m_bdiff / this.m_gradlen;
//'		msgbox("g: start " & cint(me.m_gradstartcolor.G) & ", end " & cint(me.m_gradfinishcolor.G) & ", diff " & me.m_gdiff & ", elapsed " & Math.Min(frame - Me.m_gradstartframe, Me.m_gradlen/2) & "/" & (me.m_gradlen/2) & ", " & Math.Max(frame - Me.m_gradstartframe - Me.m_gradlen/2, 0) & "/" & (me.m_gradlen/2) & ", mid " & (Me.m_gradlen/2) & " = " & ggrad)
//'		msgbox("b: start " & cint(me.m_gradstartcolor.B) & ", end " & cint(me.m_gradfinishcolor.B) & ", diff " & me.m_bdiff & ", elapsed " & Math.Min(frame - Me.m_gradstartframe, Me.m_gradlen/2) & "/" & (me.m_gradlen/2) & ", " & Math.Max(frame - Me.m_gradstartframe - Me.m_gradlen/2, 0) & "/" & (me.m_gradlen/2) & ", mid " & (Me.m_gradlen/2) & " = " & bgrad)
//'		If (rgrad < 0) Or (rgrad > 255) Then msgbox("rbad @fr " & frame & ": " & rgrad): 'rgrad = 0
//'		If (ggrad < 0) Or (ggrad > 255) Then msgbox("gbad @fr " & frame & ": " & ggrad): 'ggrad = 0
//'		If (bgrad < 0) Or (bgrad > 255) Then msgbox("bbad @fr " & frame & ": " & bgrad): 'bgrad = 0
		return Color.FromArgb(255, (byte)Math.Max(Math.Min(rgrad, 255), 0), (byte)Math.Max(Math.Min(ggrad, 255), 0), (byte)Math.Max(Math.Min(bgrad, 255), 0));
	}

	//parse a list of possibly named parameters:
	private Dictionary<string, string> m_params = new Dictionary<string, string>();
	private void GetNamedParams(string buf)
	{
		this.m_params.Clear();
		string[] paramvals = buf.Split(new char[]{','}, StringSplitOptions.RemoveEmptyEntries); //" ".ToCharArray());
		for (int i=0; i<paramvals.GetLength(0); ++i)
		{
			string[] parts = paramvals[i].Split(new char[]{'='}, 2);
			string name = (parts.GetLength(0) > 1)? parts[0].Trim(): (this.m_params.Count + 1).ToString();
			string value = parts[parts.GetLength(0) - 1].Trim();
			//LogMsg(String.Format("paramvals[{0}/{1}]: #parts {2}, name '{3}', value '{4}'", i, paramvals.GetLength(0), parts.GetLength(0), name, value), LogMode.Flush);
			this.m_params.Add(name, value);
		}
	}
	//get a parameter string by name or position:
	private string getstrparam(int pos, string name) { return getstrparam(pos, name, null); }
	private string getstrparam(int pos, string name, string defval)
	{
		if (this.m_params.ContainsKey(name))
		{
			//LogMsg(String.Format("get param by name '{0}': found value '{1}'", name, this.m_params[name]));
			return this.m_params[name];
		}
		if (this.m_params.ContainsKey(pos.ToString()))
		{
			//LogMsg(String.Format("get param by position {0}: found value '{1}'", pos, this.m_params[pos.ToString()]));
			return this.m_params[pos.ToString()];
		}
		//LogMsg(String.Format("param #{0}, name '{1}' not found", pos, name));
		return defval; //not found
	}
	//get int parameter by name or position:
	private int getintparam(int pos, string name) { return getintparam(pos, name, 0); }
	private int getintparam(int pos, string name, int defval)
	{
		string paramval = getstrparam(pos, name);
		if (paramval == null) return defval; //not found
		try { return int.Parse(paramval.Trim()); }
		catch (System.Exception /*exc*/) { return defval; }
	}

	public struct AnimationInfo
	{
		public Fraction hscroll, vscroll;
		public Point xyofs;
		public int loop;
		public AnimationInfo(object dummy) { hscroll = vscroll = null; xyofs = new Point(0, 0); loop = 0; }
	}
	private AnimationInfo m_ani = new AnimationInfo(null);

	//extract hscroll, vscroll, xofs, yofs, loop tags for animation:
	private void GetAnimation(FrameTag txtnode) //, Size wh)
	{
		if (txtnode == null) { this.m_ani.hscroll = this.m_ani.vscroll = new Fraction("0/1"); this.m_ani.xyofs = new Point(0, 0); return; }
		this.m_ani.hscroll = new Fraction(FrameTag.SafeValue(txtnode.TagNode.Attributes["hscroll"], "0"));
		this.m_ani.xyofs.X = Convert.ToInt16(FrameTag.SafeValue(txtnode.TagNode.Attributes["xofs"], "0"));
		this.m_ani.vscroll = new Fraction(FrameTag.SafeValue(txtnode.TagNode.Attributes["vscroll"], "0"));
//		int vofs = (int)(this.Geometry.Height - txtwh.Height)/2; //centered
		this.m_ani.xyofs.Y = Convert.ToInt16(FrameTag.SafeValue(txtnode.TagNode.Attributes["yofs"], "0"));
		this.m_ani.loop = Convert.ToInt16(FrameTag.SafeValue(txtnode.TagNode.Attributes["loop"], "0"));
		if (Logger.WantTrace) Logger.LogMsg(String.Format("get animation: hsrcoll {0}/{1}, vscroll {2}/{3}, xofs {4}, yofs {4}, loop {5}", this.m_ani.hscroll.Numerator, this.m_ani.hscroll.Denominator, this.m_ani.vscroll.Numerator, this.m_ani.vscroll.Denominator, this.m_ani.xyofs.X, this.m_ani.xyofs.Y, this.m_ani.loop), this.PluginID);
		if (this.m_ani.loop != 0) return; //user-specified loop count
//		int xsteps = (int)((int)wh.Width + this.m_rect.Width) * this.m_ani.hscroll.Numerator / this.m_ani.hscroll.Denominator; //total #horiz steps
//		int ysteps = (int)((int)wh.Height + this.m_rect.Height) * this.m_ani.vscroll.Numerator / this.m_ani.vscroll.Denominator; //total #vertical steps
//		this.m_ani.loop = Math.Max(xsteps, ysteps); //complete at least one full cycle on longest axis if scrolling is on
		this.m_ani.loop = -1; //forever
	}
//generate offsets for next step of animation:
//	int Animate(int ofs, Fraction scroll, int wrap)
//	{
//		ofs += (int)(this.m_repeated * scroll.Numerator / scroll.Denominator) /*- this.m_rect.Width*/;
//		while (ofs < 0) ofs += 1000 * (wh.Width + this.m_rect.Width); //kludge: keep modulo arith > 0
//		xofs = xofs % (wh.Width + this.m_rect.Width) - wh.Width; //wrap if needed
//	}
	Point Animate(Size wh, bool wrap_gap)
	{
		wrap_gap = true; //not working correctly; do it in caller
//X should go from (ofs)+0..rect w,-text w..0..rect w,... when hsrcoll > 0
//Y should go from (ofs)+0..rect h,-text h..0..rect h,... when vscroll > 0
//		int xofs = (this.m_ani.xyofs.X + (int)(this.m_repeated * this.m_ani.hscroll.Numerator / this.m_ani.hscroll.Denominator) + 100 * (wh.Width + this.m_rect.Width) - this.m_rect.Width) % (wh.Width + this.m_rect.Width) - wh.Width; //wrap
//		int yofs = (this.m_ani.xyofs.Y + (int)(this.m_repeated * this.m_ani.vscroll.Numerator / this.m_ani.vscroll.Denominator) + 100 * (wh.Height + this.m_rect.Height) - this.m_rect.Height) % (wh.Height + this.m_rect.Height) - wh.Height; //wrap
//NOTE: un-reduced fractions like hscroll="32/4" mean jump 32 after each 4 frames, not jump 8 after each frame
//		int xofs = this.m_ani.xyofs.X + (int)(this.m_repeated * this.m_ani.hscroll.Numerator / this.m_ani.hscroll.Denominator) - this.m_rect.Width;
		int xofs = this.m_ani.xyofs.X + (int)(Math.Floor((Single)(this.m_repeated / this.m_ani.hscroll.Denominator)) * this.m_ani.hscroll.Numerator) - this.m_rect.Width;
		while (xofs < 0) xofs += 1000 * (wh.Width + this.m_rect.Width); //kludge: keep modulo arith > 0
		xofs = xofs % (wh.Width + (wrap_gap? this.m_rect.Width: 0)) - wh.Width; //wrap if needed
//		int yofs = this.m_ani.xyofs.Y + (int)(this.m_repeated * this.m_ani.vscroll.Numerator / this.m_ani.vscroll.Denominator) - this.m_rect.Height;
		int yofs = this.m_ani.xyofs.Y + (int)(Math.Floor((Single)(this.m_repeated / this.m_ani.vscroll.Denominator)) * this.m_ani.vscroll.Numerator) - this.m_rect.Height;
		while (yofs < 0) yofs += + 1000 * (wh.Height + this.m_rect.Height);
		yofs = yofs % (wh.Height + (wrap_gap? this.m_rect.Height: 0)) - wh.Height; //wrap if needed
//		int svxofs = xofs, svyofs = yofs;
//		if ((this.m_ani.hscroll.Numerator > 0) && (xofs >= this.m_rect.Width)) xofs -= wh.Width + this.m_rect.Width * (this.m_ani.hscroll.Denominator / this.m_ani.hscroll.Numerator);
//		else if ((this.m_ani.hscroll.Numerator < 0) && (xofs < -wh.Width)) xofs += wh.Width + this.m_rect.Width * (this.m_ani.hscroll.Denominator / this.m_ani.hscroll.Numerator);
//		if ((this.m_ani.vscroll.Numerator > 0) && (yofs >= this.m_rect.Height)) yofs -= wh.Height + this.m_rect.Height * (this.m_ani.vscroll.Denominator / this.m_ani.vscroll.Numerator);
//		else if ((this.m_ani.vscroll.Numerator < 0) && (yofs < -wh.Height)) yofs += wh.Height + this.m_rect.Height * (this.m_ani.vscroll.Denominator / this.m_ani.vscroll.Numerator);
		if (Logger.WantTrace) Logger.LogMsg(String.Format("Animate on '{0}': (x, y) was ({1}, {2}), is now ({3}, {4}), rpt {5}, loop {6}, hscroll {7}/{8}, vscroll {9}/{10}, w {11}, h {12}, rect ({13}, {14}, {15}x{16})", this.m_fxpanelname, this.m_ani.xyofs.X, this.m_ani.xyofs.Y, xofs, yofs, this.m_repeated, this.m_ani.loop, this.m_ani.hscroll.Numerator, this.m_ani.hscroll.Denominator, this.m_ani.vscroll.Numerator, this.m_ani.vscroll.Denominator, wh.Width, wh.Height, this.m_rect.Left, this.m_rect.Top, this.m_rect.Width, this.m_rect.Height), this.PluginID);
		return new Point(xofs, yofs);
	}

//	public delegate Bitmap BitmapGetter(string name);
	private System.ComponentModel.ComponentResourceManager m_resmgr = null;
	private Bitmap GetBitmap(string name)
	{
//		Logger.LogMsg(String.Format("get bmp cur dir '{0}', exec code '{1}', typeof '{2}' locn", System.Environment.CurrentDirectory, Assembly.GetExecutingAssembly().Location, Assembly.GetAssembly(typeof(CustomFx)).Location));
		string extfile = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), name); //first try external file
		if (Logger.WantTrace) Logger.LogMsg(String.Format("GetBitmap: file '{0}' exists? {1}, type {2}", extfile, System.IO.File.Exists(extfile), /*typeof(MyCustomFx)*/this.GetType().FullName), this.PluginID);
		if (System.IO.File.Exists(extfile)) return (Bitmap)Bitmap.FromFile(extfile);
		if (this.m_resmgr == null) this.m_resmgr = new System.ComponentModel.ComponentResourceManager(/*typeof(MyCustomFx)*/this.GetType());
		Bitmap bmp = null;
		try
		{
			bmp = (Bitmap)(Image)this.m_resmgr.GetObject(name); //String.Format("{0}.Bitmap", name));
			if (Logger.WantTrace) Logger.LogMsg(String.Format("GetBitmap: res '{0}' exists? {1}", name, bmp != null), this.PluginID);
		}
		catch (Exception exc)
		{
			if (Logger.WantTrace) Logger.LogMsg(String.Format("GetBitmap: res '{0}' !exist: {1}", name, exc.ToString()), this.PluginID);
		}
		return bmp;
	}

	private static int SafeStrlen(string text)
	{
		return (text == null)? -1: text.Length;
	}
#endregion
}


#region "Font wrapper"
//wrapper for real font vs. small bitmap-based font:
//GDI Font class can't be derived, so this is a wrapper.
//I suppose the "correct" way to do this would be to create additional TTF fonts,
//but since the low res fonts only need to be bitmaps, it was easier just to make a bitmap and add a little custom code
//rather than construct a TTF and then require an installation procedure.
public class MyFont//: Font
{
	private Size m_fontwh;
	private Font m_font = null;
	private Bitmap m_raster = null;
//	private bool m_flipped;
//	private System.ComponentModel.ComponentResourceManager m_resources = null;
//	private static Regex fontmask = new Regex("^\\d+x\\d+$");
	public delegate Bitmap BitmapGetter(string name);
	public MyFont(string fontdesc, BitmapGetter GetBitmap)
	{
//first try raster font:
		this.m_fontwh = MyCustomFx.String2Size(fontdesc.Replace("font", String.Empty));
		if ((this.m_fontwh.Width > 0) && (this.m_fontwh.Height > 0))
		{
			this.m_raster = GetBitmap(String.Format("{0}.bmp", fontdesc));
			if (this.m_raster != null) { if (Logger.WantTrace) Logger.LogMsg(String.Format("font {0} uses {1}x{2} bitmaps from {3}.bmp", fontdesc, this.m_fontwh.Width, this.m_fontwh.Height, fontdesc), String.Empty); return; }
		}
//then try generic Windows font:
		short fontsize = 0;
		if (String.IsNullOrEmpty(fontdesc)) fontdesc = "Arial 10";
		System.Drawing.FontStyle fontstyle = System.Drawing.FontStyle.Regular;
		string[] fontparams = fontdesc.Replace(",", " ").Split(new char[]{' '}, StringSplitOptions.RemoveEmptyEntries); //" ".ToCharArray());
		for (int i=0; i<fontparams.Length; ++i) //look for recognizable font params
		{
//				if ((fontstyle != System.Drawing.FontStyle.Bold) && (fontstyle != System.Drawing.FontStyle.BoldItalic) && fontparams[i].Equals("bold")) fontstyle = (fontstyle == System.Drawing.FontStyle.Italic)? System.Drawing.FontStyle.BoldItalic: System.Drawing.FontStyle.Bold;
			if (((fontstyle & System.Drawing.FontStyle.Bold) == 0) && fontparams[i].ToLower().Equals("bold")) fontstyle |= System.Drawing.FontStyle.Bold;
//				else if ((fontstyle != System.Drawing.FontStyle.Italic) && (fontstyle != System.Drawing.FontStyle.BoldItalic) && fontparams[i].Equals("italic")) fontstyle = (fontstyle == System.Drawing.FontStyle.Bold)? System.Drawing.FontStyle.BoldItalic: System.Drawing.FontStyle.Italic;
			else if (((fontstyle & System.Drawing.FontStyle.Italic) == 0) && fontparams[i].ToLower().Equals("italic")) fontstyle |= System.Drawing.FontStyle.Italic;
			else if ((fontsize == 0) && Int16.TryParse(fontparams[i], out fontsize)) fontsize |= 0;
			else continue; //assume (part of) font name
			fontparams[i] = String.Empty; //consume this part of font desc
		}
		string fontface = JoinString(" ", fontparams); //use what's left as the font face
		if (Logger.WantTrace) Logger.LogMsg(String.Format("load font {0} {1}", fontface, fontsize), String.Empty);
//		this.m_font = new MyFont(fontface, fontsize, fontstyle, System.Drawing.GraphicsUnit.Pixel, (byte)fontsize, this.m_resmgr); //"Microsoft Sans Serif", 9.75!, System.Drawing.FontStyle.Regular, ...
		GraphicsUnit unit = System.Drawing.GraphicsUnit.Pixel;
		if (fontsize < 1) fontsize = 10;

//	public MyFont(string face, int size2, FontStyle style, GraphicsUnit unit, byte size, BitmapGetter GetBitmap)
//	{
//		if (MyFont.fontmask.IsMatch(face)) //check for unofficial bitmap font
//		try
//		{
//			this.m_fontwh = String2Size(fontface);
//			string myfolder = System.IO.Path.Combine(System.IO.Path.Combine(System.IO.Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName), "Plugins"), "Output"); //folder containing output plugin DLLs
//parent.ChannelMapper.Logger.LogMsg(String.Format("my folder {0}, font bmp path {1}", myfolder, System.IO.Path.Combine(myfolder, String.Format("{0}font.bmp", face))));
//			this.m_bmp = new Bitmap(System.IO.Path.Combine(myfolder, String.Format("{0}font.bmp", face)));
//			if (this.m_resources == null) this.m_resources = new System.ComponentModel.ComponentResourceManager(this.GetType());
//			if (this.m_bmp != null) this.m_bmp.Dispose();
//			this.m_raster = (Bitmap)(Image)this.m_resources.GetObject(String.Format("{0}.bmp", face));
//			parent.ChannelMapper.Logger.LogMsg(String.Format("bmp font loaded? {0}", (this.m_bmp != null)? "yes": "no"));
//			this.m_raster = GetBitmap(String.Format("{0}.bmp", fontface));
//			if (this.m_raster != null) return;
//		}
//		catch (Exception) {}
		this.m_font = new Font(fontface, fontsize, fontstyle, unit, (byte)fontsize);
	}

	private void advance_vert(ref Point xy, Size amt)
	{
		xy.Y += amt.Height + 1;
	}
	private void advance_horiz(ref Point xy, Size amt)
	{
		xy.X += amt.Width + 1;
	}
	private delegate void advancer(ref Point xy, Size amt);
	public Size DrawText(Graphics gr, string text, Color bgcolor, Color fgcolor, Rectangle destrect, Bitmap canvas, bool inverted)
	{
//		String textlines[] = text.Split("\n"); //break into multiple lines of text
		if (this.m_raster != null) //copy rasterized chars to canvas
		{
			int numlines = 1;
			for (int ofs, prev = 0; (ofs = text.IndexOf("\\n", prev)) >= 0; prev = ofs+1) ++numlines;
//TODO: BitBlt?
//			Graphics srcgr = Graphics.FromImage(this.m_bmp);
//			IntPtr srcdc = srcgr.GetHdc(), destdc = destgr.GetHdc();
//			destgr.ReleaseHdc(destdc);
//			...
//			srcgr.ReleaseHdc(srcdc);
//			BitmapData bmpdata = this.m_bmp.LockBits(new Rectangle(0, 0, this.m_bmp.Width, this.m_bmp.Height), ImageLockMode.ReadOnly, this.m_bmp.PixelFormat);
//parent.ChannelMapper.Logger.LogMsg(String.Format("raster text to draw: {0}", text));
			if (Logger.WantTrace) Logger.LogMsg(String.Format("MyFont.DrawText: raster out '{0}', {1} lines", text, numlines), String.Empty);
			ColorMap[] cmtbl = { new ColorMap(), new ColorMap() };
//TODO: make bkg color selectable in bitmap, everything else becomes fg color
			cmtbl[0].OldColor = Color.Black; //take black pixels in font bitmap
			cmtbl[0].NewColor = bgcolor; //... and replace them with desired brush color
			cmtbl[1].OldColor = Color.FromArgb(255, 255, 255, 255); //White; //take white pixels in font bitmap
			cmtbl[1].NewColor = fgcolor; //... and replace them with desired brush color
			ImageAttributes imgattr = new ImageAttributes();
			imgattr.SetRemapTable(cmtbl, ColorAdjustType.Bitmap);
//			Point[] chxy = {new Point(destrect.Left, destrect.Top), new Point(destrect.Left + this.m_fontwh.Width, destrect.Top), new Point(destrect.Left, destrect.Top + this.m_fontwh.Height)}; //upper left, upper right, lower left
			Point[] chxy = {new Point(destrect.Left, destrect.Top /*+ (numlines - 1) * this.m_fontwh.Height*/), new Point(destrect.Left + this.m_fontwh.Width, destrect.Top /*+ (numlines - 1) * this.m_fontwh.Height*/), new Point(destrect.Left, destrect.Top + /*numlines * */ this.m_fontwh.Height)}; //upper left, upper right, lower left
			if (!inverted) //kludge: vertical is mirrored
				for (int ii=0; ii<3; ++ii)
					chxy[ii].Y = canvas.Height - chxy[ii].Y;
//			parent.ChannelMapper.Logger.LogMsg(String.Format("raster text draw: {0}, charsize {1},{2}, destrect {3},{4}, {5},{6}, canvas {16}x{17}, dest location {10},{11}, {12},{13}, {14},{15}, color [{7},{8},{9}]", text, this.m_fontwh.Width, this.m_fontwh.Height, destrect.Left, destrect.Top, destrect.Width, destrect.Height, color.R, color.G, color.B, chxy[0].X, chxy[0].Y, chxy[1].X, chxy[1].Y, chxy[2].X, chxy[2].Y, canvas.Width, canvas.Height));
			int linelen = 0, maxline = 0; //max text line length (for bounding box)
			for (int i=0; i<text.Length; ++i)
			{
				if ((i + 1 < text.Length) && (text.Substring(i, 2) == "\\n"))
				{
					int vadjust = this.m_fontwh.Height + 1;
					if (!inverted) vadjust = -vadjust; //vertical is mirrored
					chxy[0].X = chxy[1].X = chxy[2].X = destrect.Left;
					chxy[1].X += this.m_fontwh.Width;
					linelen = 0;
					++i;
					chxy[0].Y += vadjust;
					chxy[1].Y += vadjust;
					chxy[2].Y += vadjust;
					continue;
				}
				if (++linelen > maxline) maxline = linelen;
				int chr = (i < 0)? ' ': text[i];
//				Rectangle debug_r = new Rectangle((ch % 0x10) * (this.m_fontwh.Width + 1), (ch / 0x10) * (this.m_fontwh.Height + 1), this.m_fontwh.Width, this.m_fontwh.Height);
//				Point debug_xy = chxy[0];
//				debug_xy = chxy[1];
//				debug_xy = chxy[2];
				int vfud = !inverted? -1 +1: /*(i == 0)? 1:*/ 0; //TODO: figure out why this is needed (probably due to non-even sizes)
//TODO: figure out why we need +2 here:
//if (chxy[0].X ==
				Rectangle r = new Rectangle((chr & 0xF) * (this.m_fontwh.Width + 1), (chr >>4) * (this.m_fontwh.Height + 1) + vfud, this.m_fontwh.Width, this.m_fontwh.Height);
				gr.DrawImage(this.m_raster, chxy, r, GraphicsUnit.Pixel, imgattr);
//				this.m_raster.GetPixel(
				if (Logger.WantTrace) Logger.LogMsg(String.Format("MyFont.DrawText raster char[{0}/{1}] '{2}': dest rect ({3},{4},{5}x{6}), pts ({7},{8}), ({9},{10}), ({11},{12}), chr {13}, xofs {14}", i, text.Length, text, r.Left, r.Top, r.Width, r.Height, chxy[0].X, chxy[0].Y, chxy[1].X, chxy[1].Y, chxy[2].X, chxy[2].Y, chr, chxy[0].X), String.Empty);
//				if (i == 0) gr.DrawImage(this.m_raster, chxy, new Rectangle((chr & 0xF) * (this.m_fontwh.Width + 1), (chr >>4) * (this.m_fontwh.Height + 1) + vfud, this.m_fontwh.Width, this.m_fontwh.Height), GraphicsUnit.Pixel, imgattr);
//				gr.DrawImage(this.m_raster, new Rectangle(chxy[0].X, chxy[0].Y, chxy[dest, new Rectangle((chr % 0x10) * (this.m_fontwh.Width + 1), (chr / 0x10) * (this.m_fontwh.Height + 1), this.m_fontwh.Width - 1, this.m_fontwh.Height - 1), GraphicsUnit.Pixel, imgattr);
//				parent.ChannelMapper.Logger.LogMsg(String.Format("draw char[{0}/{1}] {2:X} rect {3},{4}, {5},{6} at poly [{7},{8}, {9},{10}, {11},{12}]", i, text.Length, ch, (ch % 0x10) * (this.m_fontwh.Width + 1), (ch / 0x10) * (this.m_fontwh.Height + 1), this.m_fontwh.Width, this.m_fontwh.Height, chxy[0].X, chxy[0].Y, chxy[1].X, chxy[1].Y, chxy[2].X, chxy[2].Y));
				chxy[0].X += this.m_fontwh.Width + 1;
				chxy[1].X += this.m_fontwh.Width + 1;
				chxy[2].X += this.m_fontwh.Width + 1;
#if False
				advancer adv = advance_horiz;
				if (multiline) //check for horiz wrap
					for (int ii=0; ii<3; ++ii) //slide right to next char position (fixed width)
						if (chxy[ii].X + this.m_fontwh.Width + 1 > destrect.Left + destrect.Width)
						{
							chxy[0].X = destrect.Left;
							chxy[1].X = destrect.Left + this.m_fontwh.Width;
							chxy[2].X = destrect.Left;
							adv = advance_vert;
							break;
						}
				for (int ii=0; ii<3; ++ii) //slide right to next char position (fixed width), or down to next line
					adv(ref chxy[ii], this.m_fontwh);
#endif
			}
//			this.m_bmp.UnlockBits(bmpdata);
//			int linelen = (numlines > 1)? (int)Math.Floor((double)destrect.Width / (this.m_fontwh.Width + 1)): 10000; //#chars that will fit on each text line within rect; use large dummy value for single line of text
			if (Logger.WantTrace) Logger.LogMsg(String.Format("MyFont.DrawText: dest rect wh {0}x{1}, line len {2}, font wh {3}x{4}, cols {5}, rows {6}, fg [{7},{8},{9},{10}], bg [{11},{12},{13},{14}], #lines? {15}", destrect.Width, destrect.Height, linelen, this.m_fontwh.Width, this.m_fontwh.Height, Math.Min(text.Length, linelen), Math.Max(Math.Ceiling((double)text.Length/linelen), 1), fgcolor.A, fgcolor.R, fgcolor.G, fgcolor.B, bgcolor.A, bgcolor.R, bgcolor.G, bgcolor.B, numlines), String.Empty);
//			return new Size((this.m_fontwh.Width + 1) * Math.Min(text.Length, linelen), (this.m_fontwh.Height + 1) * (int)Math.Max(Math.Ceiling((double)text.Length/linelen), 1));
			return new Size((this.m_fontwh.Width + 1) * maxline, (this.m_fontwh.Height + 1) * numlines);
		}
		GraphicsState gs = gr.Save();
		if (!inverted) //kludge: vertical is mirrored
		{
//			destrect = new Rectangle(destrect.Left, canvas.Height/2, destrect.Width, -destrect.Height);
 			Matrix mx = new Matrix(1, 0, 0, -1, 0, canvas.Height);
			gr.Transform = mx; //put the origin at bottom left for more natural drawing
		}
		if (Logger.WantTrace) Logger.LogMsg(String.Format("MyFont.DrawText: draw str '{0}' to rect {1},{2}, {3},{4}, canvas is {5},{6}", text, destrect.Left, destrect.Top, destrect.Width, destrect.Height, canvas.Width, canvas.Height), String.Empty);
		gr.DrawString(text, this.m_font, new SolidBrush(fgcolor), destrect);
		if (!inverted) gr.Restore(gs); //kludge: vertical is mirrored
		StringFormat sf = new StringFormat();
//		sf.FormatFlags = StringFormatFlags.
//		Region[] reg = gr.MeasureCharacterRanges(text, this.m_font, destrect, StringFormat.GenericDefault);
//		if (reg.GetLength(0) < 1)
		{
			SizeF wh = gr.MeasureString(text, this.m_font, new SizeF(destrect.Width, destrect.Height));
//			if (Logger.WantTrace) Logger.LogMsg(String.Format("MyFont.DrawText: got no regions, use line size {0}x{1}", wh.Width, wh.Height));
			return new Size((int)wh.Width, (int)wh.Height);
		}
//		RectangleF rect = reg[0].GetBounds(gr);
//		if (Logger.WantTrace) Logger.LogMsg(String.Format("MyFont.DrawText: got {0} regions, use line size {1}x{2}", reg.GetLength(0), rect.Width, rect.Height));
//		return new Size((int)rect.Width, (int)rect.Height); //((int)wh.Width, (int)wh.Height);
	}

	private /*static*/ string JoinString(string delim, string[] strary)
	{
		StringBuilder sb = new StringBuilder();
		foreach (string str in strary)
		{
			if (String.IsNullOrEmpty(str)) continue;
			if (sb.Length > 0) sb.Append(delim);
			sb.Append(str);
		}
		return sb.ToString();
	}

//'convert "# x #" string to size:
#if false
	private /*static*/ Size String2Size(string whstr)
	{
		int ofs = whstr.IndexOf("x");
		if (ofs < 0) return new Size(0, 0);
		return new Size(Convert.ToInt32(whstr.Substring(0, ofs).Trim()), Convert.ToInt32(whstr.Substring(ofs+1).Trim()));
//'		Catch exc As Exception
//'			Me.m_logger.ReportError(String.Format("invalid size string: {0}", whstr), exc)
//'			Return New Size(0, 0)
//'		End Try
	}
#endif
} //MyFont
#endregion


#region "Channel mapper"
//This class maps channels <-> graphics bitmap canvas, allowing GDI+ functions to control channels using the GDI+ API.
//It also provides a list of choices for the Pixel Type, Geometry, and Channel Order drop-down lists in the FxGen Setup window,
// which allows the channel mapping behavior to be selected via Setup (if it is implemented that way).
//Add new options or behavior as desired.
//The base FxGen plug-in only knows about drop-down choices and Map/Unmap.
//Other behavior can be added here.
public partial class MyCustomFx
{
//	public class MySortedList<listtype>: SortedList<listtype, listtype>
//	{
//		public void Add(listtype key) { this.Add(key, key); } //just being lazy :)
//	}
//	private static /*readonly*/ Dictionary<string, int> pixtypes = new Dictionary<string, int>();// {{"monochrome", 1}, {"R/G", 2}, {"RGB", 3}, {"RGBW", 4}};
//	public MyChannelMapper() //FxGen.FxBase parent): base(parent) //inherit default drawing props
//	{
//		if (MyChannelMapper.pixtypes.Count > 0) return; //already populated
//		MyChannelMapper.pixtypes.Add("monochrome", 1);
//		MyChannelMapper.pixtypes.Add("R/G", 2);
//		MyChannelMapper.pixtypes.Add("RGB", 3);
//		MyChannelMapper.pixtypes.Add("RGBW", 4);
//	}

//map channels to bitmap (rectangular graphics canvas):
//This function is called when channel values need to be exposed to the Fx functions (Fx inbound).
//example at http://msdn.microsoft.com/en-us/library/system.drawing.imaging.bitmapdata.aspx
//most of the current hardware and plug-ins appear to be oriented towards multiple bytes per pixel (ie, no indexed color palette)
//physical I/O and sequence data size would be smaller and more efficient if a single byte were used for each pixel (used as an index into a color palette)
//for now, the code below uses the multi-byte (palette-less) approach, but it can be changed in future if desired, with no impact to the graphics/effects code
//	public Bitmap Map(ByteRange br) { return this.Map(br.Bytes, br.StartOfs, br.AvailLen); }
//	public Bitmap Map(byte[] channels) { return this.Map(channels, 0, channels.Length, null); }
//	public Bitmap Map(byte[] channels, int ofs, int len) { return this.Map(channels, ofs, len, null); }
	public override Bitmap Map(byte[] channels, int ofs, int len, Bitmap dest)
	{
		len += ofs;
		int pixsize = 3; //pixtypes[this.PixelType]; //dest (GDI canvas) is always RGB
		//TODO: this might not be right; maybe change it to be actual destination pixel size (1 - 4)?
		if (Logger.WantTrace) Logger.LogMsg(String.Format("chmapper.Map: #ch {0}, ofs {1}, len {2}, bmp? {3}, geom {4}x{5}", channels.Length, ofs, len, (dest != null), this.Geometry.Width, this.Geometry.Height), this.PluginID);
		Bitmap bmp = (dest != null)? dest: new Bitmap(new Bitmap(this.Geometry.Width +0 /*kludge: give extra memory*/, this.Geometry.Height +0 /*kludge: give extra memory*/, PixelFormat.Format32bppRgb)); //might get better performance with smaller pixel sizes, but 32 bpp is more CPU-friendly; TODO: do we need alpha channel?
		if ((channels == null) /*|| (dest == null)*/) //no source channels; set bitmap to black
		{
			if (this.m_gr == null)
			{
				this.m_gr = Graphics.FromImage(bmp);
				this.m_gr.PixelOffsetMode = PixelOffsetMode.Half; //avoid zoom rounding errors; see http://www.gamedev.net/topic/314481-drawimage-zoomed-pixel-offset-problem/
			}
			/*Graphics.FromImage(bmp)*/this.m_gr.FillRectangle(Brushes.Black, 0, 0, this.Geometry.Width, this.Geometry.Height); //start out blank
			return bmp;
		}
		this.zzset();
//		bmp = new Bitmap(bmp); //kludge: work-around suggested by http://www.msdotnet.org/Attempted-to-read-or-write-protected-memory-This-is-often-a-t345776.html
		BitmapData bmpdata = bmp.LockBits(new Rectangle(0, 0, this.Geometry.Width +0 /*kludge: give extra memory*/, this.Geometry.Height +0 /*kludge: give extra memory*/), ImageLockMode.WriteOnly, bmp.PixelFormat);
//		Color pixcolor;
#if MAPDEBUG
		SortedList<long, bool> debug = new SortedList<long, bool>();
#endif
		StringBuilder sb = Logger.WantTrace? new StringBuilder(): null;
		sb = null; //too much diagnostics
//		StringBuilder sb2 = new StringBuilder();
		if (sb != null) sb.AppendFormat("map buf {0:X} len {1}", (Int64)bmpdata.Scan0, bmpdata.Stride);
		unsafe{ //"unverifiable" wrt CLR; not the code, just Microsoft's management of it ;)
		for (int y=0; y<this.Geometry.Height; ++y) //B->T
		{
//			int yy = TB? wh.Height - y - 1: y;
//			int yy = TBBT[x & 1]? wh.Width - x - 1: x;
//			int32[][] rowadrs = new Int32[][] {bmpdata.Scan0.ToInt32() + y * bmpdata.Stride/4, bmpdata.Scan0.ToInt32() + (wh.Height - y - 1) * bmpdata.Stride/4};
//			IntPtr[] rowadrs = new IntPtr[]{(IntPtr)((int)bmpdata.Scan0 + y * bmpdata.Stride/4), (IntPtr)((int)bmpdata.Scan0 + (bmp.Height - y - 1) * bmpdata.Stride/4)};
//			int[] rowadrs = new int[] {(int)bmpdata.Scan0 + y * bmpdata.Stride, (int)bmpdata.Scan0 + (this.Geometry.Height - y - 1) * bmpdata.Stride}; //row adrs T->B or B->T
			Int32*[] rowadrs = new Int32*[] {(Int32*)bmpdata.Scan0 + y * Math.Abs(bmpdata.Stride)/sizeof(Int32), (Int32*)bmpdata.Scan0 + (this.Geometry.Height - y - 1) * Math.Abs(bmpdata.Stride)/sizeof(Int32)}; //row adrs T->B or B->T
#if MAPDEBUG
			for (int ychk = 0; ychk < 2; ++ychk)
				if ((rowadrs[ychk] < (Int32*)bmpdata.Scan0) || (rowadrs[ychk] + bmp.Width > (Int32*)bmpdata.Scan0 + bmp.Height * Math.Abs(bmpdata.Stride)/sizeof(Int32))) throw new Exception(String.Format("row{0}#{1} ofs {2:x8} out of range {3:x8}..{4:x8}", ychk, y, (long)rowadrs[0], (long)bmpdata.Scan0, (long)((Int32*)bmpdata.Scan0 + bmp.Height * Math.Abs(bmpdata.Stride)/4)));
#endif
//			byte*[] rowadrs = new byte*[]{(byte*)bmpdata.Scan0.ToPointer() + y * bmpdata.Stride/4, (byte*)bmpdata.Scan0.ToPointer() + (wh.Height - y - 1) * bmpdata.Stride/4}; //C# can't seem to handle address arithmetic, so start out simple and add below
//			rowadrs[0] += y * bmpdata.Stride/4; //for B->T addressing
//			rowadrs[1] += (wh.Height - y - 1) * bmpdata.Stride/4; //for T->B addressing
//			ArraySegment<byte> chrow = new ArraySegment<byte>(channels, y * wh.Width, wh.Width);
//			IntPtr chrow = channels + y * wh.Width;
			int chofs = y * this.Geometry.Width * pixsize + ofs;//bmp.Width;
			for (int x=0; x<this.Geometry.Width; ++x) //L->R
			{
				if (chofs + pixsize > len) break; //channel buf will overflow
//				Color pixcolor = Color.Black;
				byte R = 0, G = 0, B = 0, A = 255; //NOTE: default A to opaque so pixel will be visible
				switch (pixsize) //make color from pixel channels
				{
					case 1: R = G = B = channels[chofs++]; break;
					case 2:	R = channels[chofs++]; G = channels[chofs++]; break;
					case 3: R = channels[chofs++]; G = channels[chofs++]; B = channels[chofs++]; break;
//					case 4: R = (channels[4*x + 0] + channels[4*x + 3])\2; G = (channels[4*x + 1] + channels[4*x + 3])\2; B = (channels[4*x + 2] + channels[4*x + 3])\2; break;
					case 4: A = channels[chofs++]; R = channels[chofs++]; G = channels[chofs++]; B = channels[chofs++]; break;
				}
//				bmp.SetPixel(x, y, channels[3*x]); //slow
//				int xx = (RL || ((y & 1)? LRRL: RLLR))? wh.Width - x - 1: x;
				int xx = this.m_LRRL[y & 1]? this.Geometry.Width - x - 1: x; //L->R or R->L addressing
//TODO: check speed here vs. pointer arithment within an unsafe block
//				unsafe //"unverifiable" wrt CLR
//				{
//					((Color*)rowadrs)[TBBT[x & 1]? 1: 0][xx] = Color.FromArgb(A, R, G, B);
//				}
//				pixcolor = Color.FromArgb(A, R, G, B);
#if MAPDEBUG
				try
				{
#endif
//					Marshal.StructureToPtr(Color.FromArgb(A, R, G, B), (IntPtr)(rowadrs[this.m_TBBT[x & 1]? 1: 0] + 4*xx), false);
					rowadrs[this.m_TBBT[x & 1]? 1: 0][xx] = (A<<24) + (R<<16) + (G<<8) + B; //CAUTION: C# << precedence is all messed up; parentheses needed
//					sb2.AppendFormat(", ({0},{1})chs{2},{3},{4},{5}=>{6:X}'{7}[{8}]={9:X}", x, y, A, R, G, B, (Int64)destadrs, this.m_TBBT[x & 1]? 1: 0, xx, destadrs[xx]);
//					sb2.AppendFormat(", ({0},{1})chs{2},{3},{4},{5}=>{6:X}", x, y, A, R, G, B, rowadrs[this.m_TBBT[x & 1]? 1: 0][xx]);
					if (x == 0) if (sb != null) sb.AppendLine();
					if (sb != null) sb.AppendFormat(", '{0}=[{1:X},{2:X},{3:X},{4:X}]=>'{5:X}+{6}", chofs-pixsize, A, R, G, B, (Int64)rowadrs[this.m_TBBT[x & 1]? 1: 0], xx);
#if MAPDEBUG
					debug.Add(rowadrs[this.m_TBBT[x & 1]? 1: 0] + xx - (Int32*)bmpdata.Scan0, true);
				}
				catch (Exception)
				{
					debug.Add(rowadrs[this.m_TBBT[x & 1]? 1: 0] + xx - (Int32*)bmpdata.Scan0, false);
				}
#endif
			}
		}}
		bmp.UnlockBits(bmpdata);
		if (sb != null) Logger.LogMsg(sb.ToString(), this.PluginID);
//	this.Logger.LogMsg(sb2.ToString());
#if MAPDEBUG
		StringBuilder sb = new StringBuilder();
		sb.AppendFormat("{0} entries for {1} x {2}, NOT OKAY:", debug.Count, bmp.Height, bmpdata.Stride);
		foreach (KeyValuePair<long, bool> kv in debug)
			if (!kv.Value) sb.AppendFormat(", {0}", kv.Key);
		sb.Append(", okay:");
		foreach (KeyValuePair<long, bool> kv in debug)
			if (kv.Value) sb.AppendFormat(", {0}", kv.Key);
		string used = sb.ToString();
#endif
		return bmp;
	}

//unmap bitmap (rectangular graphics canvas) back to channels:
//This function is called to copy Fx function output back to Vixen channel values (outgoing).
//	public byte[] Unmap(Bitmap bmp) { return this.Unmap(bmp, null, 0, 3 * this.Geometry.Width * this.Geometry.Height); }
//	public byte[] Unmap(Bitmap bmp, ByteRange br) { return this.Unmap(bmp, br.Bytes, br.StartOfs, br.AvailLen); }
//	public /*override*/ byte[] Unmap(Bitmap bmp, byte[] dest) { return this.Unmap(bmp, dest, 0, dest.Length); }
	public override byte[] Unmap(Bitmap bmp, byte[] dest, int ofs, int len)
	{
		len += ofs;
		int pixsize = Math.Min(pixtypes[this.PixelType], 4); //src bitmap is always RGB, dest may vary 1 - 4
		if (Logger.WantTrace) Logger.LogMsg(String.Format("chmapper.Unmap: bmp {0} x {1}, ofs {2}, len {3}, pix size {4}, geom {5}x{6}", (bmp != null)? bmp.Width: -1, (bmp != null)? bmp.Height: -1, ofs, len, pixsize, this.Geometry.Width, this.Geometry.Height), this.PluginID);
		byte[] channels = (dest != null)? dest: new byte[/*pixsize*/ 3 * this.Geometry.Width * this.Geometry.Height]; //always RGB
		if (bmp == null) //no source bitmap; set all channels to 0
		{
			for (int i=0; i<channels.Length; ++i) channels[i] = 0;
			return channels;
		}
		EchoFloods(channels, ofs); //kludge: pass thru src to dest here
		if (!this.m_didfx) return channels; //no need to map all channels, just the channels to echo
		this.zzset();
//		bmp = new Bitmap(bmp); //kludge: work-around suggested by http://www.msdotnet.org/Attempted-to-read-or-write-protected-memory-This-is-often-a-t345776.html
		BitmapData bmpdata = bmp.LockBits(new Rectangle(0, 0, this.Geometry.Width +0 /*kludge: give extra memory*/, this.Geometry.Height +0 /*kludge: give extra memory*/), ImageLockMode.ReadOnly, bmp.PixelFormat);
//		Color pixcolor; //= new Color();
#if MAPDEBUG
		SortedList<long, bool> debug = new SortedList<long, bool>();
#endif
		StringBuilder sb = Logger.WantTrace? new StringBuilder(): null;
		sb = null; //new StringBuilder(); //too much diagnostics
		if (sb != null) sb.AppendFormat("unmap buf {0:X} len {1}", (Int64)bmpdata.Scan0, bmpdata.Stride);
		unsafe{ //"unverifiable" wrt CLR; not the code, just Microsoft's management of it ;)
		for (int y=0; y<this.Geometry.Height; ++y) //B->T
		{
//			IntPtr[] rowadrs = new IntPtr[] {(IntPtr)((int)bmpdata.Scan0 + y * bmpdata.Stride/4), (IntPtr)((int)bmpdata.Scan0 + (bmp.Height - y - 1) * bmpdata.Stride/4)};
			Int32*[] rowadrs = new Int32*[] {(Int32*)bmpdata.Scan0 + y * Math.Abs(bmpdata.Stride)/sizeof(Int32), (Int32*)bmpdata.Scan0 + (this.Geometry.Height - y - 1) * Math.Abs(bmpdata.Stride)/sizeof(Int32)}; //row adrs T->B or B->T
#if MAPDEBUG
			for (int ychk = 0; ychk < 2; ++ychk)
				if ((rowadrs[ychk] < (Int32*)bmpdata.Scan0) || (rowadrs[ychk] + bmp.Width > (Int32*)bmpdata.Scan0 + bmp.Height * Math.Abs(bmpdata.Stride)/sizeof(Int32))) throw new Exception(String.Format("row{0}#{1} ofs {2:x8} out of range {3:x8}..{4:x8}", ychk, y, (long)rowadrs[0], (long)bmpdata.Scan0, (long)((Int32*)bmpdata.Scan0 + bmp.Height * Math.Abs(bmpdata.Stride)/4)));
#endif
//			byte*[] rowadrs = new byte*[] {bmpdata.Scan0.ToPointer() + y * bmpdata.Stride/4, bmpdata.Scan0.ToPointer() + (wh.Height - y - 1) * bmpdata.Stride/4};
//			ArraySegment<byte> chrow = new ArraySegment<byte>(channels, y * wh.Width, wh.Width);
			int chofs = y * this.Geometry.Width * pixsize + ofs;
//TODO: check for chofs overflow if len set
			for (int x=0; x<this.Geometry.Width; ++x) //L->R
			{
				if (chofs + pixsize > len) break; //channel buf will overflow
				int xx = this.m_LRRL[y & 1]? this.Geometry.Width - x - 1: x;
//				Color pixcolor;
//				unsafe //"unverifiable" wrt CLR
//				{
//					pixcolor = ((Color*)rowadrs)[TBBT[x & 1]? 1: 0][xx];
//				}
//				Color pixcolor = new Color;
//TODO: check speed here vs. pointer arithmetic within an unsafe block
#if MAPDEBUG
				Color pixcolor = new Color();
				try
				{
//					pixcolor = (Color)Marshal.PtrToStructure((IntPtr)(rowadrs[this.m_TBBT[x & 1]? 1: 0] + 4*xx), typeof(Color));
					Int32 argb = rowadrs[this.m_TBBT[x & 1]? 1: 0][xx];
					pixcolor = Color.FromArgb((argb>>24) & 0xff, (argb>>16) & 0xff, (argb>>8) & 0xff, argb & 0xff);
					debug.Add(rowadrs[this.m_TBBT[x & 1]? 1: 0] + xx - (Int32*)bmpdata.Scan0, true);
				}
				catch (Exception)
				{
					debug.Add(rowadrs[this.m_TBBT[x & 1]? 1: 0] + xx - (Int32*)bmpdata.Scan0, false);
				}
#else
				Int32 argb = rowadrs[this.m_TBBT[x & 1]? 1: 0][xx];
				Color pixcolor = Color.FromArgb((argb>>24) & 0xff, (argb>>16) & 0xff, (argb>>8) & 0xff, argb & 0xff);
				if (x == 0) if (sb != null) sb.AppendLine();
				if (sb != null) sb.AppendFormat(", '{0}=[{1:X},{2:X},{3:X},{4:X}] => '{5:X}+{6}", chofs, pixcolor.A, pixcolor.R, pixcolor.G, pixcolor.B, (Int64)rowadrs[this.m_TBBT[x & 1]? 1: 0], xx);
#endif
				switch (pixsize) //extract channel values from pixel in color bitmap
				{
					case 1: channels[chofs++] = Math.Max(pixcolor.R, Math.Max(pixcolor.G, pixcolor.B)); break; //set monochrome to brightest color
					case 2:	channels[chofs++] = pixcolor.R; channels[chofs++] = pixcolor.G; break;
					case 3: channels[chofs++] = pixcolor.R; channels[chofs++] = pixcolor.G; channels[chofs++] = pixcolor.B; break;
//					case 4: channels[chofs++] = pixcolor.R; channels[chofs++] = pixcolor.G; channels[chofs++] = pixcolor.B; channels[chofs++] = (pixcolor.R + pixcolor.G + pixcolor.B)/3; break;
//wrong					case 4: channels[chofs++] = pixcolor.R; channels[chofs++] = pixcolor.G; channels[chofs++] = pixcolor.B; channels[chofs++] = pixcolor.A; break;
					case 4:
						if ((pixcolor.R == pixcolor.G) && (pixcolor.G == pixcolor.B)) //grayscale
						{
							channels[chofs++] = channels[chofs++] = channels[chofs++] = 0; //don't use R, G, B
							channels[chofs++] = pixcolor.R; //set white level
						}
						else
						{
							channels[chofs++] = pixcolor.R; channels[chofs++] = pixcolor.G; channels[chofs++] = pixcolor.B;
							channels[chofs++] = 0; //don't use white if R != G != B
						}
						break;
				}
				if (sb != null)
					for (int i=0; i<pixsize; ++i)
						sb.AppendFormat("{0}{1:X}", (i != 0)? ",": "=", channels[chofs - pixsize + i]);
			}
		}}
		bmp.UnlockBits(bmpdata);
		if (sb != null) Logger.LogMsg(sb.ToString(), this.PluginID);
#if MAPDEBUG
		StringBuilder sb = new StringBuilder();
		sb.AppendFormat("{0} entries for {1} x {2}, NOT OKAY:", debug.Count, bmp.Height, bmpdata.Stride);
		foreach (KeyValuePair<long, bool> kv in debug)
			if (!kv.Value) sb.AppendFormat(", {0}", kv.Key);
		sb.Append(", okay:");
		foreach (KeyValuePair<long, bool> kv in debug)
			if (kv.Value) sb.AppendFormat(", {0}", kv.Key);
		string used = sb.ToString();
#endif
		return channels;
	}

//return a list of choices for pixel type/size:
//	private string m_pixsize = string.Empty;
//	public /*override*/ string PixelType { get { return this.m_pixsize; } set { this.m_pixsize = value; }} //csc doesn't like "get; set;" shortcuts
	private static readonly Dictionary<string, int> pixtypes = new Dictionary<string, int>() {{"monochrome", 1}, {"R/G", 2}, {"RGB", 3}, {"RGBW", 4}, {"RGWB", 5}};
	public override /*static*/ List<string> PixelTypes()
	{
//		return ChannelMapper.pixtypes.Keys;
		List<string> types = new List<string>();
		foreach (string key in MyCustomFx.pixtypes.Keys) types.Add(key);
//		types.Add("monochrome", 1);
//		types.Add("R/G", 2);
//		types.Add("RGB", 3);
//		types.Add("RGBW", 4);
//		return (new List<string>(types.Values)).ToArray();
		if (Logger.WantTrace) Logger.LogMsg("pixel type choices: " + Join(types), this.PluginID);
		return types;
	}

//return a list of width/height geometry for quantity of channels and pixel type:
//	private Size m_geom = new Size(0, 0);
//	public /*override*/ Size Geometry { get { return this.m_geom; } set { this.m_geom = value; }} //csc doesn't like "get; set;" shortcuts
	public override /*static*/ List<Size> Geometries() //int numch)
	{
		List<Size> whopts = new List<Size>();
		int pixsize = Math.Min(MyCustomFx.pixtypes[this.PixelType], 4);
		for (int w=1; w*w*pixsize <= this.NumChannels; ++w) //W, H are <= sqrt(#channels/pixel size)
		{
//			if (whlist.Count > 100) break; //avoid giving too many choices on large grids
			Size wh = new Size(w, this.NumChannels / (pixsize * w)); //use #rows that will fit within given #channels
			if (pixsize * w * wh.Height < 9 * this.NumChannels / 10) continue; //avoid choices where > 10% wasted channels (arbitrary); cuts down on list size
//			whopts.Insert(0, wh); //put square-most option at front of list
//			if (wh.Width != wh.Height) whopts.Insert(1, new Size(wh.Height, wh.Width)); //also show reverse option
			whopts.Add(wh); //put square-most option at front of list
			if (wh.Width != wh.Height) whopts.Add(new Size(wh.Height, wh.Width)); //also show reverse option
//			whopts.Add(FxGen_base.FxGen.FxGenPluginBase.Size2String(hw), hw); //also show reverse option
		}
#if MAPDEBUG
		StringBuilder sb = new StringBuilder();
		sb.AppendFormat("{0} geometry = {1}: ", this.NumChannels, whlist.Count);
		foreach (Size wh in whlist) sb.AppendFormat(", {0}", this.Size2String(wh));
		string choices = sb.ToString();
#endif
		if (Logger.WantTrace) Logger.LogMsg(String.Format("canvas geometry choices for pix type '{0}': {1}", this.PixelType, Join(whopts)), this.PluginID);
		return whopts; //(new List<Size>(whopts.Values)).ToArray();
	}

//zig-zag options:
	private bool[] m_TBBT = new bool[]{false, false}, m_LRRL = new bool[] {false, false}; //top<->bottom, left<->right flags
	private void zzset()
	{
		this.m_TBBT[0] = this.m_TBBT[1] = this.m_LRRL[0] = this.m_LRRL[1] = false;
//set direction/zig-zag addressing control flags:
		if (this.ChannelOrder.IndexOf("LRRL") != -1) this.m_LRRL[0] = true;
		else if (this.ChannelOrder.IndexOf("RLLR") != -1) this.m_LRRL[1] = true;
		else if (this.ChannelOrder.IndexOf("RL") != -1) this.m_LRRL[0] = this.m_LRRL[1] = true;
		if (this.ChannelOrder.IndexOf("TBBT") != -1) this.m_TBBT[0] = true;
		else if (this.ChannelOrder.IndexOf("BTTB") != -1) this.m_TBBT[1] = true;
		else if (this.ChannelOrder.IndexOf("TB") != -1) this.m_TBBT[0] = this.m_TBBT[1] = true;
	}
//	private string m_chorder = null;
	public bool IsFlipped { get { return !(this.m_TBBT[0] && this.m_TBBT[1]); }} //TODO: this should be handled in Adjustable Preview and Grid Editor instead
//	public /*override*/ string ChannelOrder
//	{
//		get { return this.m_chorder; }
//		set
//		{
//			this.m_chorder = value;
//			this.setZZ();
//		}
//	}

//return a list of channel order choices for chosen geometry:
	private static readonly Dictionary<string, bool> LRchoices = new Dictionary<string, bool>() {{"LR", true}, {"LRRL", false}, {"RL", true}, {"RLLR", false}}; // left <-> right variants
	private static readonly Dictionary<string, bool> TBchoices = new Dictionary<string, bool>() {{"TB", true}, {"TBBT", false}, {"BT", true}, {"BTTB", false}}; // top <-> bottom variants
	public override /*readonly static*/ List<string> ChannelOrders()
	{
		List<string> orders = new List<string>();
		if (this.Geometry.Height == 1)
			if (this.Geometry.Width == 1)
				orders.Add("(one pixel)");
			else foreach (string xorder in LRchoices.Keys)
				if (LRchoices[xorder])
					orders.Add(xorder);
				else continue;
		else if (this.Geometry.Width == 1) 
			foreach (string yorder in TBchoices.Keys)
				if (TBchoices[yorder])
					orders.Add(yorder);
				else continue;
		else
			foreach (string xorder in LRchoices.Keys) // left <-> right variants
				foreach (string yorder in TBchoices.Keys) // top <-> bottom variants
				{
//					if ((xorder.Length > 2) && (yorder.Length > 2)) continue; //2-axis zig-zags don't seem to make sense
					//zig-zag only makes sense on inner (fastest-changing) dimension:
					if (xorder.Length <= 2) orders.Add(String.Format("{0}-{1}", xorder, yorder)); //horizontal strings
					if (yorder.Length <= 2) orders.Add(String.Format("{0}-{1}", yorder, xorder)); //vertical strings
				}
//radial can be mapped to LR/TB, so don't offer separate cases:
//		foreach (string radial in string[]{"CWIO", "CCWIO", "CWOI", "CCWOI"}) //radial in <-> out variants
//			orders.Add(radial);
		if (Logger.WantTrace) Logger.LogMsg(String.Format("channel order choices for pix type '{0}', geometry '{1}': {2}", this.PixelType, this.Geometry, Join(orders)), this.PluginID);
		return orders; //(new List<string>(orders.Values)).ToArray();
	}
	//for debug only:
	private string Join(List<string> list)
	{
		StringBuilder sb = new StringBuilder();
		foreach (string choice in list)
			sb.AppendFormat(", {0}", choice);
		if (sb.Length < 1) sb.Append(", (none)");
		return sb.ToString(2, sb.Length - 2);
	}
	private string Join(List<Size> list)
	{
		StringBuilder sb = new StringBuilder();
		foreach (Size choice in list)
			sb.AppendFormat(", {0}x{1}", choice.Width, choice.Height);
		if (sb.Length < 1) sb.Append(", (none)");
		return sb.ToString(2, sb.Length - 2);
	}
} //Channel mapper
#endregion

#region "Fx UI"
public partial class MyCustomFx
{
	//return list of plugin channels + names:
	//NOTE: .NET isn't allowing override of static, so this must go directly in CustomFx
//	public override Dictionary<int, string> GetPluginTags(XmlNode opnode) //string PluginTag, string name) //Vixen.IExecutable virtseq, XmlNode hostnode)
	public override void GetFxChannels(string name, string PluginTag, Dictionary<int, ColoredString> dict) //Vixen.IExecutable virtseq, XmlNode hostnode, Dictionary<int, string> dict) //string PluginTag, string name) //Vixen.IExecutable virtseq, XmlNode hostnode)
	{
//		Dictionary<int, string> dict = new Dictionary<int, string>();
//		foreach (Vixen.OutputPlugin vopi in virtseq.PlugInData.GetOutputPlugins())
//		foreach (XmlNode tagnode in opnode.SelectNodes("VirtPlugins/MappedPlugin/Tag"))
//		{
//			string PluginTags = tagnode.InnerText;
//			XmlNode plugnode = hostnode.SelectSingleNode(String.Format("{0}[@id='{1}']", "VirtPlugins/MappedPlugin", vopi.Id.ToString));
//			string plugintag = plugnode.SelectSingleNode("Tag").InnerText;
//			string name = String.Format("{0}:{1} [{2}..{3}]", opnode.Attributes["name"].Value, opnode.Attributes["id"].Value, opnode.Attributes["from"].Value, opnode.Attributes["to"].Value); //default name
			Match parts = nametag.Match(PluginTag);
			if (parts.Success && (parts.Groups.Count == 1+1)) name = parts.Groups[1].Value; //override default name
			int chnum = ResolveChAlias("func", PluginTag);
			if ((chnum != -1) && !dict.ContainsKey(chnum)) dict.Add(chnum, new ColoredString(String.Format("{0} FxFunc #{1}", name, chnum)));
			chnum = ResolveChAlias("param", PluginTag);
			if ((chnum != -1) && !dict.ContainsKey(chnum)) dict.Add(chnum, new ColoredString(String.Format("{0} FxParam #{1}", name, chnum)));
			int[] colorch = ResolveChAliases("color", PluginTag, 4);
			if ((colorch != null) && (colorch.Length == 4))
			{
				if (!dict.ContainsKey(colorch[0])) dict.Add(colorch[0], new ColoredString(String.Format("{0} FxColor.A #{1}", name, colorch[0]), 0xFF, 0xFF, 0xC0));
				if (!dict.ContainsKey(colorch[1])) dict.Add(colorch[1], new ColoredString(String.Format("{0} FxColor.R #{1}", name, colorch[1]), 0xFF, 0xC0, 0xC0));
				if (!dict.ContainsKey(colorch[2])) dict.Add(colorch[2], new ColoredString(String.Format("{0} FxColor.G #{1}", name, colorch[2]), 0xC0, 0xFF, 0xC0));
				if (!dict.ContainsKey(colorch[3])) dict.Add(colorch[3], new ColoredString(String.Format("{0} FxColor.B #{1}", name, colorch[3]), 0xC0, 0xF0, 0xFF));
			}
//			chnum = ResolveChAlias("echo", PluginTag);
//			if ((chnum != -1) && !dict.ContainsKey(chnum)) dict.Add(chnum, String.Format("{0} FxEcho #{1}", name, chnum));
			chnum = ResolveChAlias("text", PluginTag);
			if ((chnum != -1) && !dict.ContainsKey(chnum)) dict.Add(chnum, new ColoredString(String.Format("{0} FxText #{1}", name, chnum), 0xFF, 0xFF, 0xC0));
//		}
//		return dict;
	}

	//return list of plugin tags indexed by fx func channel#:
	//NOTE: .NET isn't allowing override of static, so this must go directly in CustomFx
	//NOTE: if multiple props resolve to same fx channel, only the first one is kept
	public static Dictionary<int, string> EnumFxProps(XmlNode opnode)
	{
		Dictionary<int, string> list = new Dictionary<int, string>();
		foreach (XmlNode tagnode in opnode.SelectNodes("VirtPlugins/MappedPlugin/Tag"))
		{
			string plugtag = tagnode.InnerText;
			int fxchfunc = ResolveChAlias("func", plugtag);
			if (fxchfunc != -1) SafeAdd(list, fxchfunc, plugtag);
			int fxchparam = ResolveChAlias("param", plugtag);
			if (fxchparam != -1) SafeAdd(list, fxchparam, plugtag);
			int[] fxchcolor = ResolveChAliases("color", plugtag, 4);
			if (fxchcolor != null)
				for (int i=0; i<fxchcolor.Length; ++i)
					SafeAdd(list, fxchcolor[i], plugtag);
			int fxchtext = ResolveChAlias("text", plugtag);
			if (fxchtext != -1) SafeAdd(list, fxchtext, plugtag);
		}
		return list;
	}

	public static bool SafeAdd(Dictionary<int, string> dict, int key, string val)
	{
		if (dict.ContainsKey(key)) return false;
		dict.Add(key, val);
		return true;
	}
	
	//extract fx func channel alias from tag:
	public static int[] ResolveChAliases(string name, string plugtag, int count)
	{
		System.Text.RegularExpressions.Match parts;
		if ((name == "color") && (count == 4)) parts = colortag.Match(plugtag);
		else return null;
		if (parts.Success && (parts.Groups.Count == 4+1))
		{
			int[] chaliases = new int[4];
			chaliases[0] = Convert.ToInt32(parts.Groups[1].Value);
			chaliases[1] = Convert.ToInt32(parts.Groups[2].Value);
			chaliases[2] = Convert.ToInt32(parts.Groups[3].Value);
			chaliases[3] = Convert.ToInt32(parts.Groups[4].Value);
			return chaliases;
		}
		return null;
	}
		
	public static int ResolveChAlias(string name, string plugtag)
	{
		System.Text.RegularExpressions.Match parts;
		if (name == "func") parts = functag.Match(plugtag);
		else if (name == "param") parts = paramtag.Match(plugtag);
//		else if (name == "color") parts = colortag.Match(plugtag);
//		if (parts.Success && (parts.Groups.Count == 4+1))
//		{
//			chlist.Add(fxchcolor[0] = Convert.ToInt32(parts.Groups[1].Value));
//			chlist.Add(fxchcolor[1] = Convert.ToInt32(parts.Groups[2].Value));
//			chlist.Add(fxchcolor[2] = Convert.ToInt32(parts.Groups[3].Value));
//			chlist.Add(fxchcolor[3] = Convert.ToInt32(parts.Groups[4].Value));
//		}
//		parts = nametag.Match(plugtag);
//		if (parts.Success && (parts.Groups.Count == 1+1)) fxpanelname = parts.Groups[1].Value;
		else if (name == "text") parts = texttag.Match(plugtag);
		else return -1;
		if (parts.Success && (parts.Groups.Count == 1+1)) return Convert.ToInt32(parts.Groups[1].Value);
		return -1;
	}

	//show dialog window for setting fx params:
	public static List<int> FxUI(Vixen.EventSequence seq, int frame, string plugid, string plugtag)
	{
		//Logger.WantTrace = true;
		//if (Logger.WantTrace) Logger.LogMsg("in custom FxUI");
		//parse channel aliases:
		List<int> chlist = new List<int>();
		string fxpanelname = string.Empty;
		int fxchfunc = -1, fxchparam = -1, fxchtext = -1;
		int[] fxchcolor = new int[] {-1, -1, -1, -1};
		System.Text.RegularExpressions.Match parts = functag.Match(plugtag);
		if (parts.Success && (parts.Groups.Count == 1+1)) chlist.Add(fxchfunc = Convert.ToInt32(parts.Groups[1].Value));
		parts = paramtag.Match(plugtag);
		if (parts.Success && (parts.Groups.Count == 1+1)) chlist.Add(fxchparam = Convert.ToInt32(parts.Groups[1].Value));
		parts = colortag.Match(plugtag);
		if (parts.Success && (parts.Groups.Count == 4+1))
		{
			chlist.Add(fxchcolor[0] = Convert.ToInt32(parts.Groups[1].Value));
			chlist.Add(fxchcolor[1] = Convert.ToInt32(parts.Groups[2].Value));
			chlist.Add(fxchcolor[2] = Convert.ToInt32(parts.Groups[3].Value));
			chlist.Add(fxchcolor[3] = Convert.ToInt32(parts.Groups[4].Value));
		}
		parts = nametag.Match(plugtag);
		if (parts.Success && (parts.Groups.Count == 1+1)) fxpanelname = parts.Groups[1].Value;
		parts = texttag.Match(plugtag);
		if (parts.Success && (parts.Groups.Count == 1+1)) chlist.Add(fxchtext = Convert.ToInt32(parts.Groups[1].Value));
		//if (Logger.WantTrace) Logger.LogMsg(String.Format("{0} parse tags: func {1}, param {2}+, color {3}+, text {4}", fxpanelname, fxchfunc, fxchparam, fxchcolor[0], fxchtext));
		//populate dialog window with available options:
		//if (Logger.WantTrace) Logger.LogMsg(String.Format("func {0}, text {1}, start ui", fxchfunc, fxchtext));
		MyFx.EffectParams dlg = new MyFx.EffectParams();
		if (!string.IsNullOrEmpty(fxpanelname)) dlg.PropName = fxpanelname;
		if (fxchfunc != -1)
		{
			//if (Logger.WantTrace) Logger.LogMsg("here1 with plugid " + plugid);
			dlg.effectChoices = FxGenPluginBase.EnumFrameTags(seq.PlugInData.GetPlugInData(plugid), "fxfunc");
			//if (Logger.WantTrace) Logger.LogMsg("here1.1 with " + dlg.effectChoices.Count + " choices, evt[" + fxchfunc + "," + frame + "]");
			//if (Logger.WantTrace) Logger.LogMsg("here1.2 with " + seq.EventValues[fxchfunc, frame]);
			dlg.effectBox = seq.EventValues[fxchfunc -1, frame]; //this.HostChannel(fxfunc, frame);
			//if (Logger.WantTrace) Logger.LogMsg("here1.3 with " + dlg.effectBox);
//			this.toolStripComboBoxColumnZoom.Items.AddRange(new object[] { "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%", "100%", "150%", "200%", "300%", "400%", "500%", "600%", "700%", "800%", "900%", "1000%" }); //add options > 100% -dj
		}
		if (fxchtext != -1)
		{
			//if (Logger.WantTrace) Logger.LogMsg("here2");
			dlg.textChoices = FxGenPluginBase.EnumFrameTags(seq.PlugInData.GetPlugInData(plugid), "fxtext");
			dlg.bmpChoices = FxGenPluginBase.EnumFrameTags(seq.PlugInData.GetPlugInData(plugid), "fximage");
			//if (Logger.WantTrace) Logger.LogMsg("here2.1 with " + dlg.textChoices.Count + " choices, evt[" + fxchtext + "," + frame + "]");
			dlg.textBox = seq.EventValues[fxchtext -1, frame]; //this.HostChannel(fxtext, frame);
		}
		//if (Logger.WantTrace) Logger.LogMsg("here3");
		if (fxchcolor[0] != -1) dlg.colorBox = Color.FromArgb(seq.EventValues[fxchcolor[0] -1, frame], seq.EventValues[fxchcolor[1] -1, frame], seq.EventValues[fxchcolor[2] -1, frame], seq.EventValues[fxchcolor[3] -1, frame]); //this.HostChannel(fxchcolor[0], frame), this.HostChannel(fxchcolor[1], frame), this.HostChannel(fxchcolor[2], frame), this.HostChannel(fxchcolor[3], frame));
		if (fxchparam != -1) dlg.paramBox = seq.EventValues[fxchparam -1, frame]; //this.HostChannel(fxparam, frame);
		//show options to user, get response:
		//if (Logger.WantTrace) Logger.LogMsg("here4");
		DialogResult dr = dlg.ShowDialog();
		//if (Logger.WantTrace) Logger.LogMsg("here5, result " + dr);
		if (dr != DialogResult.OK)
		{
			MessageBox.Show(String.Format("NOT Saved: '{0}' was selected", dr.ToString()), "NOT Saved", System.Windows.Forms.MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
			dlg.Dispose();
			return null;
		}
		//update sequence values:
		if (fxchfunc != -1) seq.EventValues[fxchfunc -1, frame] = dlg.effectBox;
		if (fxchtext != -1)
		{
			seq.EventValues[fxchtext -1, frame] = dlg.textBox; //NOTE: could be text or image
//			byte val = dlg.textBox;
//			Dictionary<string, XmlNode> choices = dlg.textChoices;
//			foreach (string key in choices.Keys)
//			{
//				if (choices[key].Attributes("value") != val) continue;
//				if (key.EndsWith("(BMP)")) seq.EventValues[fxchtext
//			}
		}
		if (fxchparam != -1) seq.EventValues[fxchparam -1, frame] = dlg.paramBox;
		if (fxchcolor[0] != -1)
		{
			seq.EventValues[fxchcolor[0] -1, frame] = dlg.colorBox.A;
			seq.EventValues[fxchcolor[1] -1, frame] = dlg.colorBox.R;
			seq.EventValues[fxchcolor[2] -1, frame] = dlg.colorBox.G;
			seq.EventValues[fxchcolor[3] -1, frame] = dlg.colorBox.B;
		}
		if (Logger.WantTrace) Logger.LogMsg("here6, done", String.Empty);
		dlg.Dispose();
		return chlist;
	}
}
#endregion
} //namespace


#if false
//					if (plugtype.GetInterface("IOutputPlugIn") == null) continue; //not an output plug-in
					foreach (MethodInfo entpt in plugtype.GetMethods(BindingFlags.Public))
					{
						if (entpt.ToString() == "FxUI")
						{
							ParameterInfo[] params = entpt.GetParameters();
							if (params.Length != 5) continue;
//TODO: maybe check param types more
//							If params(0).ToString() <> "Byte()" Then Continue For
//							(Me.VixPlugin.GetType().GetMethods(Byte(), Byte())
							pluginf.ui = entpt;
						}
						break;
					}
					if (pluginf.ui != null) break;
				}
				if (pluginf.ui != null) continue;
				if (Logger.WantTrace) LogMsg("plugin " + opi.Id + " '" + opi.Name + "' is enabled + has fx ui, check virt plug-ins...");
				foreach (XmlNode virtplugnode in this.m_sequence.PlugInData.GetPlugInData(opi.Id))// .RootNode.SelectNodes("PlugIn/VirtPlugins/MappedPlugin"))
				{
					string newid = virtplugnode.ParentNode.ParentNode.Attributes["Id"].Value;
					pluginf.fxtag = virtplugnode.SelectSingleNode("Tag").InnerText;
					if (Logger.WantTrace) LogMsg("found virt plugin with tag " + pluginf.fxtag);
					Match parts = functag.Match(pluginf.fxtag);
					if (!parts.Success || (parts.Groups.Count != 1+1)) continue;
					int fxchfunc = SafeInt(parts.Groups[1].Value);
					if (this.fxtags.ContainsKey(fxchfunc)) continue; //dups shouldn't happen, but check just in case
					if (Logger.WantTrace) LogMsg("uses fxfunc channel aliased to " + fxchfunc);
//					pluginf.ctor = opi.GetType().GetConstructor(new Type[] {}); //'{ GetType(Vixen.IExecutable), GetType(Vixen.OutputPlugin), GetType(XmlNode), GetType(XmlNode) }) 'ctor defined in PluginWrapper section (below)
//					if (pluginf.ctor == null) continue;
					if (newid != curid) //load frame tags
					{
						if (Logger.WantTrace) LogMsg("new plugin id " + newid + " != cur id " + curid + ", load frame tags...");
						fxfuncs.Clear();
						fxtexts.Clear();
						foreach (XmlNode frametag in virtplugnode.ParentNode.ParentNode.SelectNodes("FrameTags/Tag"))
						{
							if (Logger.WantTrace) LogMsg("found frametag " + frametag.InnerText + " for plugin id " + virtplugnode.ParentNode.ParentNode.Attributes["Id"].Value);
//							if (frametag.Attributes["value"] == null) continue; //TODO: handle start/end time
							byte val = SafeByte(frametag.Attributes["value"]);
							string track = SafeString(frametag.Attributes["track"]);
							if (track == "fxfunc")  fxfuncs.Add(frametag.InnerText, val);
							if (track == "fxtext")  fxtexts.Add(frametag.InnerText, val);
//TODO: time-based frametags
//'13:				Dim stframe As Integer = Me.Time2Frame_seq(safevalue(tagnode.Attributes("start"), trackfrom(trk))) 'default tag start
//'14:				Dim enframe As Integer = Me.Time2Frame_seq(tagnode.Attributes("end").Value)
						}
						curid = newid; //virtplugnode.ParentNode.ParentNode.Attributes["Id"];
						if (Logger.WantTrace) LogMsg("found " + fxfuncs.Count + " funcs, " + fxtexts.Count + " texts");
//#if false
15:					For Each plugtype As Type In System.Reflection.Assembly.LoadFile(dll).GetExportedTypes()
16:						If plugtype.GetInterface("IOutputPlugIn") Is Nothing Then Continue For 'not an output plug-in
17:						Dim plugin As Vixen.IOutputPlugIn = Nothing
						Try
18:							plugin = DirectCast(Activator.CreateInstance(plugtype), Vixen.IEventDrivenOutputPlugIn)
						Catch exc As Exception
19:							If Me.m_logger.WantTrace Then Me.m_logger.LogMsg(String.Format("can't load plug-in type '{0}' from dll '{1}': {2} @{3}", plugtype.Name, dll, exc.ToString, Erl))
							Continue For 'something wrong with this one, so just skip it
						End Try
20:						For Each vop As Vixen.OutputPlugin In Me.m_vixinfo.Seq.PlugInData.GetOutputPlugins
21:							If vop.Name <> plugin.Name Then Continue For 'find the plug-in for this DLL
22:							Dim opnode As XmlNode = Me.m_vixinfo.Seq.PlugInData.GetPlugInData(vop.Id.ToString)
23:							Dim pluginf As FxGen.PlugInfo = New FxGen.PlugInfo(vop.Id, Me.m_vixinfo, Me.m_logger) 'opnode.Attributes("id").Value
'							If plugnode Is Nothing Then Continue For 'plugin not used by this sequence
'							plugi.Name = seqop.Name 'opnode.Attributes("name").Value
24:							pluginf.RealEnabled = CBool(opnode.Attributes("enabled").Value)
25:							pluginf.RealStartChannel = CInt(opnode.Attributes("from").Value)
26:							pluginf.RealEndChannel = CInt(opnode.Attributes("to").Value)
27:							pluginf.Desc = String.Format("{0}:{1}[{2}..{3}]", vop.Name, pluginf.ID, pluginf.RealStartChannel, pluginf.RealEndChannel)
'							pluginf.VirtStartChannel = pluginf.RealStartChannel
'							pluginf.VirtEndChannel = pluginf.RealEndChannel
							Dim foundport As Match = Me.FindPort.Match(opnode.InnerXml)
							If foundport.Success AndAlso (foundport.Groups.Count >= 2) Then 'remember which ports are used
								pluginf.PortProp = foundport.Groups(1).Value
								pluginf.PortName = foundport.Groups(2).Value
								If pluginf.RealEnabled Then
									If Not Me.m_vixinfo.PortsUsed.ContainsKey(pluginf.PortName) Then Throw New Exception(String.Format("Plugin '{0}' uses invalid port: {1}, choices are: {2}", pluginf.Desc, pluginf.PortName, Join(portnames, ", ")))
									If Not String.IsNullOrEmpty(Me.m_vixinfo.PortsUsed(pluginf.PortName)) Then Throw New Exception(String.Format("Plugin '{0}' port {1} conflicts with plugin '{2}'", pluginf.Desc, pluginf.PortName, Me.m_vixinfo.PortsUsed(pluginf.PortName)))
									Me.m_vixinfo.PortsUsed(pluginf.PortName) = pluginf.Desc 'remember which one used it
								End If
							End If
'28:						If (pluginf.NumRealChannels < 1) Or (pluginf.NumRealChannels > 10000) Then Throw new Exception(String.Format("Plug-in {0} invalid channel range", pluginf.Desc))
'29:							Dim virtnode As XmlNode = Me.m_setupNode.SelectSingleNode(String.Format("VirtPlugins/Plugin[@id='{0}']", vop.Id.ToString))'(0)
'30:							If virtnode IsNot Nothing Then ') AndAlso (fxnodes.Count > 0) Then
'31:								pluginf.VirtEnabled = CBool(virtnode.Attributes("enabled").Value)
'								pluginf.VirtStartChannel = CInt(virtnode.Attributes("from").Value)
'								pluginf.VirtEndChannel = CInt(virtnode.Attributes("to").Value)
'							End If
32:							pluginf.PlugType = plugtype
33:							pluginf.VixPlugin = DirectCast(plugin, IEventDrivenOutputPlugIn) 'TODO: is it more efficient to do this later?  (had to instantiate for test above, anyway) there should only be a small number of plug-ins for a given sequence, so maybe it doesn't matter
							'check if plug-in supports virtual I/O:
'							For Each method As MethodInfo In plugtype.GetMethods(BindingFlags.Public)
'								If method.ToString() <> "xyz" Then Continue For
''								Dim params As ParameterInfo() = method.GetParameters()
''								If params.Length <> 1 Then Continue For
''								If params(0).ToString() <> "Byte()" Then Continue For
''								(Me.VixPlugin.GetType().GetMethods(Byte(), Byte())
'								pluginf.VirtIO = method
'								Exit For
'							Next method
34:							If Me.m_logger.WantTrace Then Me.m_logger.LogMsg(String.Format("output plug-in: desc '{0}', id {1}, type '{2}' from dll '{3}'", pluginf.Desc, pluginf.ID, plugtype.Name, dll))
35:							Me.m_plugins.Add(pluginf.Desc, pluginf) 'list of all the valid, loadable plug-ins for this sequence (sorted)
'no!							don't Exit For 'there might be more than one instance of this plug-in
//#endif


//					Dim piw As FxGenPluginBase = DirectCast(ctor.Invoke(new Type() {}), FxGenPluginBase) 'new Object() { virtseq, vopi, virtseq.PlugInData.GetPlugInData(vopi.Id.ToString()), hostnode.SelectSingleNode(String.Format("VirtPlugin[@id='{0}']", vopi.Id.ToString))}), FxGenPluginBase)
//					If piw Is Nothing Then Continue For
//'			Dim ctors As ConstructorInfo() = Me.GetType().GetConstructors()
//'			dim dj as String = ""
//'			For i As Integer = 1 To ctors.length
//'				Dim params As ParameterInfo() = ctors(i - 1).GetParameters()
//'				dj &= ", " & ctors(i - 1).IsPublic & ":" & ctors(i - 1).Name & " " & params.Length & " params"
//'			Next i
//'			Logger.LogMsg(ctors.Length & " ctors for " & Me.GetType().Name & ": " & dj)
//'			Logger.LogMsg(String.Format("got {0} ctor for {1} ({2}, {3}, {4}, {5}? {6}", Me.GetType().FullName, vopi.Name, virtseq.GetType().FullName, vopi.GetType().FullName, virtseq.PlugInData.GetPlugInData(vopi.Id.ToString()).GetType().FullName, GetType(XmlNode).FullName, ctor IsNot Nothing))
//			piw.MyNew(virtseq, vopi, virtseq.PlugInData.GetPlugInData(vopi.Id.ToString()), hostnode.SelectSingleNode(String.Format("{0}[@id='{1}']", MyPlugins, vopi.Id.ToString)))
#endif
