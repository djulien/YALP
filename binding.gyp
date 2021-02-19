#node-gyp uses this file to generate a Makefile
#for node-gyp info see https://gyp.gsrc.io/docs/UserDocumentation.md
#file format: https://gyp.gsrc.io/docs/InputFormatReference.md
#keys ending with "=" will completely replace old value
#keys ending with "?" will be used only if key doesn't already have a value
#keys ending with "+" will prepend to previous value
#undecorated keys will append to previous value
#example files: https://github.com/nodejs/node-gyp/wiki/%22binding.gyp%22-files-out-in-the-wild
#NOTE: node-gyp reads all uncommented entries
#NOTE: after changing this file, delete build folder to remove cached info
#NOTE: nvm uses an internal copy of node.gyp; https://github.com/nodejs/node-gyp/wiki/Updating-npm%27s-bundled-node-gyp
#NOTE?: cflags needs node.gyp ver >= 3.6.2; see https://gist.github.com/TooTallNate/1590684
#to upgrade node.gyp:
#  [sudo] npm explore npm -g -- npm install node-gyp@latest
{
    'targets':
    [
        {
            "target_name": "yalp-addon", #3p24
#            'type': '<(library)',
#            'type': 'executable',
            "sources": ["src/yalp-napi.cpp"],
#            "cflags_cc!": [ "-fno-exceptions" ],
#CAUTION: cflags requires node.gyp ver >= 3.6.2 ??
#use "npm install --verbose" to verify these options are being passed correctly to compiler:
            "cflags":
            [
#"-E",
#debug:                "-E", #show cpp output; goes to build/Release/obj.target/gpuport/src/GpuPort.o
#                "-S", #generate assembler output and stop
                "-g", #include debug symbols
                "-O3", #optimization
#                "-O0", #no optimization
                "-ftemplate-depth=100", #__LINE__ used by COUNTER()
                "-std=c++17", "-Weffc++", #"-std=c++11", "-std=c++14"
                "-fPIC", "-pthread", "-fno-omit-frame-pointer", #"-fno-rtti",
                "-Wall", "-Wextra", "-Wno-unused-parameter", "-w", "-Wall", "-pedantic", "-Wvariadic-macros",
                "-fexceptions", #"-fno-exceptions",
#                "-DNODEJS_ADDON", #using node-gyp => want Node.js add-on
            ],
#CAUTION: check common.gypi for whether to use cflags or cflags_cc
#path ~/.node-gyp/*/include/node/common.gypi/.node-gyp/*/include/node/common.gypi
            "cflags_cc!": #conflict with above; turn off these options (in case common.gypi turns them on)
            [
                "-fno-exceptions",
                "-std=gnu++1y",
            ],
#NOTE?: node-gyp only reads *one* "cflags_cc+" here, otherwise node-gyp ignores it
#            'cflags_cc': ["-w", "-Wall", "-pedantic", "-Wvariadic-macros", "-g", "-std=c++11"], #-std=c++0x
#            'cflags+': ["-w", "-g", "-DNODEJS_ADDON", "-Wall", "-std=c++11"],
#            'cflags+': ["-w", "-g", "-Wall", "-std=c++11"],
            'variables':
            {
#                'hasSDL': "<!(type -p sdl2-config  &&  echo \"-DHAS_SDL\"  ||  exit 0)",
#                'hasX': "<!(type -p X  &&  echo \"-DHAS_XWINDOWS\"  ||  exit 0)", #for dev/debug only
#NOTE: node-gyp doesn't like "type -P", so use "command -v" instead
                'hasSDL': "<!(command -v sdl2-config >/dev/null  &&  echo \"HAS_SDL\"  ||  echo \"HASNT_SDL\")", #exit 0)",
#                'hasX': "<!(command -v X >/dev/null  &&  echo \"HAS_XWINDOWS\"  ||  echo \"HASNT_XWINDOWS\")", #exit 0)", #for dev/debug only
            },
            'defines':
            [
#                "NODEJS_ADDON", #using node-gyp => want Node.js add-on
                'NAPI_DISABLE_CPP_EXCEPTIONS', #?? https://github.com/nodejs/node-addon-api/blob/master/doc/setup.md
                'BUILT="<!(date +\"%F %T\")"',
#runt chk only                'XWINDOWS="<!(echo $DISPLAY)"', #don't compile for framebuffer
#                'XWINDOWS="<!(type -p X &>/dev/null && echo \"yes\" || echo \"no\")"', #installed, but might not be running
                "VERSION=<!@(node -p \"JSON.parse(require('fs').readFileSync('package.json')).version\")",
                "<(hasSDL)",
#                "<(hasX)",
#                "<!(command -v sdl2-configg >/dev/null  &&  echo \"HAS_SDL\"  ||  echo \"HASNT_SDL\")",
#                "<!(command -v X >/dev/null  &&  echo \"HAS_XWINDOWS\"  ||  echo \"HASNT_XWINDOWS\")", #for dev/debug only
            ],
            'include_dirs':
            [
#                "<!@(node -p \"require('nan')\")",
#                "<!(node -e \"require('nan')\")",
                "<!@(node -p \"require('node-addon-api').include\")",
#               'include_dirs+' : ["<!(node -e \"require('nan')\")"],
#                "<!@(node -p \"require('node-addon-api').include\")"
#                "<!@(node -p \"require('node-addon-api').include + '/src'\")"
#                "<!@(node -p \"require('path').resolve(__dirname, require('napi_thread_safe_promise').include)\")",
#                "<!@(node -p \"require('napi_thread_safe_promise').include\")",
#               'include_dirs+': [" <!(sdl2-config --cflags)"], #CAUTION: need "+" and leading space here
#                " <!(test -x sdl2-config  &&  sdl2-config --cflags  ||  exit 0)", #CAUTION: need leading space here
#                " <!@(command -v sdl2-config  &&  sdl2-config --cflags  ||  exit 0)", #CAUTION: need leading space here
#                " <!@(test -n <!(hasSDL)  &&  sdl2-config --cflags)", #CAUTION: need leading space here
                " <!@(test -n \"<(hasSDL)\"  &&  sdl2-config --cflags  ||  exit 0)", #CAUTION: need leading space here
            ],
#            'OTHER_LDFLAGS+': ['-stdlib=libc++'],
            'libraries':
            [
#                " <!@(command -v sdl2-config  &&  sdl2-config --libs  ||  exit 0)", #-lGL #-lSDL2
                " <!@(test -n \"<(hasSDL)\"  &&  sdl2-config --libs  ||  exit 0)", #CAUTION: need leading space here
#                " <!@(test -n <!(hasSDL)  &&  sdl2-config --libs)", #-lGL #-lSDL2
#handled by SDL?                " <!@(test -n \"<(hasX)\"  && echo \"-lX11 -lXxf86vm\"  ||  exit 0)", #for dev/debug only
#                " -L'<!(pwd)'",
#                "<(module_root_dir)/build/Release/",
                " -lmpg123 -lao", #audio
            ],
            'dependencies':
            [
                "<!(node -p \"require('node-addon-api').gyp\")",
#            'dependencies': [ 'deps/mpg123/mpg123.gyp:output' ],
#            "dependencies": [ "<!(node -p \"require('node-addon-api').gyp\")" ],
#TODO:                'deps/sdl2/sdl2.gyp:output',
#                "<!(node -p \"console.log('add SDL2 compile');\")",
#                "<!(node -p \"require('napi_thread_safe_promise').gyp\")",
            ],
#            'conditions':
#            [
#                [
#                    'OS=="linux-rpi"',
#                    '<!@(uname -p)=="armv7l"', #RPi 2
#                    'target_arch=="arm"', #RPi 2
#                    {
#                        'defines': ["IS_RPI"],
#                        'defines': ["RPI_NO_X"], #don't want X Windows client
##                        'cflags+': ["-DNODEJS_ADDON"],
##?                        'libraries+': ["-L/opt/vc/lib", "-lbcm_host"],
##?                        'include_dirs+':
##?                        [
##?                            "/opt/vc/include",
##?                            "/opt/vc/include/interface/vcos/pthreads",
##?                            "/opt/vc/include/interface/vmcs_host/linux",
##                        ],
#                    },
#                    'OS=="linux-pc"', #else
#                    '<!@(type -p Xxx &>/dev/null && echo \"yes\" || echo \"no\") == "yes"',
#                    {
##                        "xcode_settings": {
##                        'defines': ["UNIV_LEN=32"], #for dev/testing
##                        'defines': ["SHADER_DEBUG"], #for dev/testing
##                        'libraries': ["-lX11"]
#                        'libraries': ["-lX11", "-lXxf86vm"], #, "-lXext", "-lXxF86vm"] #for dev/debug only
##            'libraries+': ["-lGLESv2", "-lEGL", "-lm"],
#                    },
#                ],
#            ],
        },
    ],
}
#eof
