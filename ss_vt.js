/** 
 * This version of polaroid picturepile is all inline rather than 
 * using pxComponents.
 * 
 * It takes a SAT and and uses it to get image json from the 
 * Personalized Media Service.
 * 
 * Performance logging log messages have the following meanings: 
 * 
 * PXAPP_INIT_3:    Logged as soon as js is loaded, and there are 3 PROCESS messages expected
 * PXAPP_VISIBLE:   Logged when cork background is ready (downloaded) 
 * PXAPP_PROCESS_1: Logged when JSON is received from websocket
 * PXAPP_PROCESS_2: Logged when first picture pile image is ready
 * PXAPP_PROCESS_3: Logged when toasters (overlays) page is ready
 * 
 * */
"use strict";
px.import({scene:"px:scene.1.js",ws:'ws'}).then( function ready(imports) {

  var scene = imports.scene;
  var root = scene.root;
  var ws = imports.ws;


console.log("PXAPP_INIT_3"); // 3 here indicates there will be 3 PROCESS log messages to track

var basePackageUri = px.getPackageBaseFilePath();
var bgUrl = basePackageUri+"/images/cork.png";
var bgShadowUrl = basePackageUri+"/images/radial_gradient.png";
var shadowUrl = basePackageUri+"/images/BlurRect.png";
var shadowImageObj = scene.create({t:"imageResource",url:shadowUrl});

var dataService = "wss://px-wss.sys.comcast.net:8443";  // default
if( px.appQueryParams.dataServ !== undefined) {
  dataService = px.appQueryParams.dataServ;
}
  
var overlays = px.appQueryParams.overlays;
if( overlays === undefined || (overlays != 1 && overlays != 0)) {overlays = 1;} // Default to showing overlays

var numimages = px.appQueryParams.numimages;
if( numimages === undefined) { numimages = 10;}
  
var doRotation = px.appQueryParams.rotation;
if( doRotation === undefined || (doRotation != 1 && doRotation != 0)) {doRotation = 1;}

var usePainting = px.appQueryParams.usePainting;
if( usePainting === undefined || (usePainting != 1 && usePainting != 0)) {usePainting = 1;}
console.log("usePainting = "+usePainting);

// Number of images on screen before they start to fade away
var numVisible = 5;

// Get query params
var sat = px.appQueryParams.sat;

//var bgResource = scene.create({t:"imageResource",url:bgUrl});
  
// Create the background cork image
var bg = scene.create({t:"image",url:bgUrl,parent:root,stretchX:2,stretchY:2,w:root.w,h:root.h});
 
  var SOCKET_PATH_SCREENSAVER = "/screensaver";
  var SOCKET_PATH_URL = "/websocket";
  var TYPE_NAME_URL = "url";

  // DataService
  var DataService = function(socketPath,typeName, value) {

      // Function vars
      var open, message, close, error;
      var mySocket = new ws(dataService+socketPath);
      var removeListeners = function() {
        console.log("removing ws listeners");
        mySocket.removeListener('open', open);
        mySocket.removeListener('message', message);
        mySocket.removeListener('close', close);
        mySocket.removeListener('error', error);
      } 
      var promise = new Promise(function(resolve,reject) {

        open = function() {
            console.log("Received open");
            var newJson =  {};
            newJson["token"] = sat;
            newJson[typeName] = value;
            mySocket.send(JSON.stringify(newJson));
        }
        message = function(message) {
          console.log("received response");
            resolve( message);
            
        }
        close = function() {
          console.log('closing socket and removing handlers');
          removeListeners();
        }
         error = function(msg) {
          console.log('ERROR on socket: '+msg);
          removeListeners();
          reject("SS0002");
        }

        mySocket.on('open', open);
        mySocket.on('message', message);
        mySocket.on('close', close);
        mySocket.on('error', error);        
    });

    return {
              wsSocket : mySocket,
              dataPromise : promise,
              cleanup : removeListeners
           }
          
  }


    
  function randomInt(from, to) {
    var range = to-from;
    return Math.round(Math.random()*range + from);
  }
  function randomIntFromList(li) {
              return li[randomInt(0,li.length-1)]
  }


var imagesFileUrl = "http://ips-prod.apps.xcal.tv/image-service/v2/images/public?";
var screensaverPromise = DataService(SOCKET_PATH_URL, TYPE_NAME_URL, imagesFileUrl);

var firstPicture = null;
var firstFg = null;
var firstCaption = null; 
var jsonImageUrlsReceived = false;


var reusePictures = false;
var urlIndex = -1;

var imageHandler = (function() {
  var urls = [];
  var numUrls = 0;


  return {
    
      getImageInfo:  function() {
        urlIndex++;
        if(urlIndex >=numUrls) { reusePictures = true; urlIndex = 0;}
        var info = {};
        info.url = urls[urlIndex].url;
        info.caption = urls[urlIndex].caption;
        if( info.caption !== undefined && info.caption.includes('<')) info.caption = "";
        return info;
      },

      handleJson: function(data) {
          console.log("PARSING JSON FOR URLS");
            try {
              urls = JSON.parse(data);

              numUrls = urls.length;
              // Only show the max set via numimages
              if(numUrls > numimages) {
                numUrls = numimages; 
              }
              else if( numimages > numUrls)
                numimages = numUrls;
                
              if(numVisible >= numUrls) {
                numVisible = numUrls-1;
              }
              console.log("DONE PARSING JSON FOR URLS");
        }
        catch(e) {
          console.log("JSON FOR URLS WAS NOT VALID");
          numUrls = 0;
          numVisible = 0;
        }
      },
      getNumUrls: function() { return numUrls; }
    };
})();



var maxCover = 0.7;
var maxW;
var maxH;

var polaroidH = (scene.root.h - 50) * 0.90;
var polaroidW = (polaroidH*0.83);


var bgShadow = scene.create({t:"image",url:bgShadowUrl,parent:bg,stretchX:1,stretchY:1,a:0.75});

var captionFont = scene.create({t:"fontResource", url:"http://pxscene.org/examples/px-reference/fonts/DancingScript-Regular.ttf"});

var toasters = null; 
var numPictures = 0;
// back layer
var picturesBg = scene.create({t:"object",parent:root});
// middle layer
var pictures = scene.create({t:"object",parent:root});
// front layer
var picturesFg = scene.create({t:"object",parent:root});


var sidePadding = polaroidW*.0536;
var topPadding = polaroidH * .06;
var bottomPadding = polaroidH * 0.206;
   
var adjH = polaroidH -(topPadding+bottomPadding);
var adjW = polaroidW -(sidePadding*2);  

// Define different targetY functions depending if rotation is on or off
function yPosRotation() {
  return (50+topPadding);
}
function yPosNoRotation() {
  return (randomInt(15,75));
}

var targetY;

if( doRotation == 1) 
  targetY = yPosRotation;
else 
  targetY = yPosNoRotation;

var savedPictures = [];
  
  
function recyclePictures() {
  
      var item = savedPictures[urlIndex];
      if(usePainting == 1) {
        item.painting = false;
      }
      // reset picture values
      item.x = (randomInt(0,1)==0)?-1000:scene.w+2000;
      item.y = (randomInt(0,1)==0)?-root.h:root.h;
      item.sx = 3; 
      item.sy = 3; 
      item.r = (doRotation==1)?randomIntFromList([-15,11]):0;
      item.a = 0;
      //console.log("Item is "+item);
      item.parent = picturesFg;
      //console.log("Parent is assigned");
      if(usePainting == 1) {
        pictures.painting = true;
        item.painting = true;
      }
      item.animateTo({x:randomInt(50+sidePadding,scene.w-(polaroidW)-50),
                          y:randomInt(targetY(),scene.h-(polaroidH)-25),
                          r:(doRotation==1)?randomIntFromList([-15,11]):0,
                          sx:1,sy:1,a:1},2.5,scene.animation.TWEEN_STOP,scene.animation.OPTION_LOOP, 1)
      .then(function(savedPic) {
        //console.log("Done animating reused pxobjects");
                savedPic.parent = pictures;
                if(usePainting == 1) {
                  pictures.painting = true; 
                  pictures.painting=false;
                }
                if (pictures.numChildren > numVisible-1) {
                  var f = pictures.getChild(0);
                  f.parent = picturesBg;
                  if(usePainting == 1) {
                    pictures.painting = true; 
                    pictures.painting = false;
                  }
                  f.animateTo({a: 0}, 0.75, scene.animation.TWEEN_LINEAR, scene.animation.OPTION_LOOP, 1)
                    .then(function(f){
                      f.remove();
                    });
                }
        var info = imageHandler.getImageInfo();
        recyclePictures();
                
      });

}
function newPicture() {
    
    var info = imageHandler.getImageInfo();
    if( reusePictures == true) {
      recyclePictures();

      
    } else {
    var url = info.url;
    var caption = info.caption;
     //var rotation = math.randomIntFromList([-15,11]);
    var picture = scene.create({t:"object",parent:picturesFg,
                                x:(randomInt(0,1)==0)?-1000:scene.w+2000,
                                 y:(randomInt(0,1)==0)?-root.h:root.h,
                                 sx: 3, sy: 3, 
                                 r: (doRotation==1)?randomIntFromList([-15,11]):0,
                                 a:0});
    console.log("Adding to saved Pictures with urlIndex "+urlIndex);
    savedPictures[urlIndex] = picture;
    var shadow = scene.create({t:"image9",x:-37,y:-37,w:polaroidW+(40*2),h:polaroidH+(40*2),resource:shadowImageObj,parent:picture,a:0.45,insetTop:48,insetBottom:48,insetLeft:48,insetRight:48});
    var frame = scene.create({t:"rect",w:polaroidW,h:polaroidH,parent:picture,fillColor:0xF8F8F8FF,lineColor:0xCCCCCC80,lineWidth:2});
    var captions = scene.create({t:"textBox" ,
          parent: frame,
          clip: true,
          a: 1,
          y: frame.h - bottomPadding +5,
          x: sidePadding,
          h: bottomPadding - 20,
          w: frame.w - (sidePadding * 2),
          text:caption,
          textColor:0x000000FF,
          alignHorizontal:scene.alignHorizontal.CENTER,
          font:captionFont,
          pixelSize:22,
          wordWrap:true,
          truncation:scene.truncation.TRUNCATE_AT_WORD,
          ellipsis:true});
    var cropper = scene.create({
        t: "rect",
        parent: picture,
        clip: true,
        a: 1,
        y: topPadding,
        x: sidePadding,
        h: frame.h - topPadding - bottomPadding,
        w: frame.w - (sidePadding * 2)
    })
    var fg = scene.create({t:"image",x:0,y:0,parent:cropper,url:url,stretchX:1,stretchY:1});
    
    fg.ready.then(function(pic){
      console.log("PICTUREPILE IMAGE IS READY");
      if(usePainting == 1) {
        picture.painting = false;
      }
      picture.a = 1;
      var picW = pic.resource.w;
      var picH = pic.resource.h;



//// scale and crop
      if (picW >= picH) {

          pic.h = cropper.h;

          // now need to determine how much more to scale
          pic.w = Math.round(pic.h * picW / picH)
          pic.x = -Math.round(((pic.w - frame.w) / 2)) - sidePadding

      } else {

          pic.w = cropper.w;

          // now need to determine how much more to scale
          pic.h = Math.round(pic.w * picH / picW)
          pic.y = -Math.round(((pic.h - frame.h) / 2)) - topPadding
      }
      if(usePainting == 1) {
        picture.painting = true;
      }
// end scale and crop
      picture.animateTo({x:randomInt(50+sidePadding,scene.w-(polaroidW*fg.sx)-50),
                          y:randomInt(targetY(),scene.h-(polaroidH*fg.sx)-25),
                          r:(doRotation==1)?randomIntFromList([-15,11]):0,sx:1,sy:1},2,scene.animation.TWEEN_STOP,scene.animation.OPTION_LOOP, 1)
        .then(function() {
          picture.parent = pictures;
          if(usePainting == 1) {
            pictures.painting = true; 
            pictures.painting=false;
          }
          if (pictures.numChildren > numVisible-1) {
            var f = pictures.getChild(0);
            f.parent = picturesBg;
            if(usePainting == 1) {
              pictures.painting = true; 
              pictures.painting = false;
            }
            f.animateTo({a: 0}, 0.75, scene.animation.TWEEN_LINEAR, scene.animation.OPTION_LOOP, 1)
              .then(function(f){
                f.remove();
              });
          }
          newPicture();
          // Only start the overlays once at least one pic is on screen
          if( overlays == 1 && toasters == null) {
              toasters = scene.create({t:"scene",a:0,parent:root,w:root.w,h:root.h,url:basePackageUri+"/overlays.js?sat="+sat+"&dataServ="+dataService});
              toasters.ready.then(function(obj) {
                console.log("PXAPP_PROCESS_3"); // toasters page is ready
                //toasters.moveToFront();
                toasters.animateTo({a:1},1,scene.animation.TWEEN_STOP,scene.animation.OPTION_LOOP, 1);
              }).catch( function sceneCreate(err){
                console.error("Scene creation failed for overlay: " + err)
              });
          }
        });    
    },function(){
      console.log("failed to load an image from urls in json!");
      picture.remove();
      newPicture();
    });

   }
 }
           
function doIt() {
  
	var urlIndex = 0;
    console.log("DO IT!");
   // When doIt is called, the promise for url json has been fulfilled
   
    //var url = info.url;
    //var caption = info.caption;
   
   if( firstFg != null) {
     console.log("Assigning data to firstFg and firstCaption");
     var tempInfo = imageHandler.getImageInfo();
     firstCaption.text = tempInfo.caption;
     firstFg.url = tempInfo.url;
   } else {
     console.log("Setting jsonImageUrlsReceived = true because firstFg is not created yet!");
     jsonImageUrlsReceived = true;
   }

  
}
   
  function firstNewPicture() {
    //console.log(">>>>>>>>>>>>>>>>>>>>> In firstNewPicture");

    firstPicture = scene.create({t:"object",parent:picturesFg,
                                x:(randomInt(0,1)==0)?-1000:scene.w+2000,
                                 y:(randomInt(0,1)==0)?-root.h:root.h,
                                 sx: 3, sy: 3, 
                                 r:(doRotation==1)?randomIntFromList([-15,11]):0,
                                 a:0});

    savedPictures[0] = firstPicture;
    var shadow = scene.create({t:"image9",x:-37,y:-37,w:polaroidW+(40*2),h:polaroidH+(40*2),resource:shadowImageObj,parent:firstPicture,a:0.45,insetTop:48,insetBottom:48,insetLeft:48,insetRight:48});
    var frame = scene.create({t:"rect",w:polaroidW,h:polaroidH,parent:firstPicture,fillColor:0xF8F8F8FF,lineColor:0xCCCCCC80,lineWidth:2});
    firstCaption = scene.create({t:"textBox" ,
          parent: frame,
          clip: true,
          a: 0,
          y: frame.h - bottomPadding +5,
          x: sidePadding,
          h: bottomPadding - 20,
          w: frame.w - (sidePadding * 2),
          //text:caption,
          textColor:0x000000FF,
          alignHorizontal:scene.alignHorizontal.CENTER,
          font:captionFont,
          pixelSize:22,
          wordWrap:true,
          truncation:scene.truncation.TRUNCATE_AT_WORD,
          ellipsis:true});
    var firstCropper = scene.create({
        t: "rect",
        parent: firstPicture,
        clip: true,
        a: 1.0,
        y: topPadding,
        x: sidePadding,
        h: frame.h - topPadding - bottomPadding,
        w: frame.w - (sidePadding * 2),
        fillColor:0x000000ff
    })
    //console.log("Creating firstFg");
    firstFg = scene.create({t:"image",x:0,y:0,parent:firstCropper,stretchX:1,stretchY:1,a:0});
    //console.log("picture about to animate");
    firstCropper.animateTo({a:0.2},3.0,scene.animation.TWEEN_LINEAR,scene.animation.OPTION_LOOP, 1);
    firstPicture.animateTo({x:randomInt(50+sidePadding,scene.w-(polaroidW*firstFg.sx)-50),
                        y:randomInt(50+topPadding,scene.h-(polaroidH*firstFg.sx)-25),
                        r:(doRotation==1)?randomIntFromList([-15,11]):0,
                        sx:1,sy:1,a:1},2,scene.animation.TWEEN_STOP,scene.animation.OPTION_LOOP, 1)
      .then(function() {
        //cropper.animateTo({a:1},0.5,$.animation.TWEEN_LINEAR,$.animation.OPTION_LOOP, 1);
        console.log("picture done animating");
      // For the first picture, let's not wait for the image to come in...
      // let's animate like it's a polaroid that's just developing...
      console.log("CHECKING jsonImageUrlsReceived:"+jsonImageUrlsReceived);
      if(jsonImageUrlsReceived === true) {
       console.log("jsonImageUrlsReceived is true");
       var tempInfo = imageHandler.getImageInfo();
       firstCaption.text = tempInfo.caption;
       firstFg.url = tempInfo.url;
      }
      firstFg.ready.then(function(pic){
        console.log("PXAPP_PROCESS_2");//"FIRST PICTUREPILE IMAGE IS READY");
        jsonImageUrlsReceived = true;
        if(usePainting == 1) {
          firstPicture.painting = false;
        }
        //firstPicture.a = 1;
        var picW = pic.resource.w;
        var picH = pic.resource.h;

console.log("about to scale and crop");

      // scale and crop
        if (picW >= picH) {

            pic.h = firstCropper.h;

            // now need to determine how much more to scale
            pic.w = Math.round(pic.h * picW / picH)
            pic.x = -Math.round(((pic.w - frame.w) / 2)) - sidePadding

        } else {

            pic.w = firstCropper.w;

            // now need to determine how much more to scale
            pic.h = Math.round(pic.w * picH / picW)
            pic.y = -Math.round(((pic.h - frame.h) / 2)) - topPadding
        }
        if(usePainting == 1) {
          firstPicture.painting = true;
        }
        firstCropper.animateTo({a:1},0.7,scene.animation.TWEEN_LINEAR,scene.animation.OPTION_LOOP, 1);
        console.log("firstCaption.animateTo");
        firstCaption.animateTo({a:1},0.9,scene.animation.TWEEN_STOP,scene.animation.OPTION_LOOP, 1);//.then(function() {
        console.log("firstFg.animateTo");
        firstFg.animateTo({a:1},0.8,scene.animation.TWEEN_LINEAR,scene.animation.OPTION_LOOP, 1).then(function() {
          console.log("About to call newPicture");
          // Only start newPicture animations once the
        // Move firstPic to the background
        firstPicture.parent = pictures;
        if(usePainting == 1) {
          pictures.painting = true; 
          pictures.painting=false;
        }
        newPicture();
        });

      });
    },function(){
      var res = firstPicture.resource;
      console.log("Error loading image statusCode:"+res.loadStatus.statusCode+
                  " httpStatusCode:"+res.loadStatus.httpStatusCode);
      firstPicture.remove();
      newPicture();
    });
   
 }



function updateSize(w, h) {

  bg.w = w;
  bg.h = h;

  bgShadow.w = w;
  bgShadow.h = h;

  pictures.w = w;
  pictures.h = h;
  if(usePainting == 1) {
    pictures.painting = true; pictures.painting = false;
  }

  maxW = w*maxCover;
  maxH = h*maxCover;
  if(toasters != null) {
    toasters.w = w; 
    toasters.h = h;
  }
  
}

scene.on("onResize", function(e){updateSize(e.w,e.h);});
updateSize(scene.w, scene.h);

scene.on("onClose", function(e) {
  console.log(">>>>>>>>>>>>>>>>>>>>> Received onClose event!");
  if( screensaverPromise !== undefined && screensaverPromise !== null) {
    screensaverPromise.cleanup();
    screensaverPromise.wsSocket.close();
    screensaverPromise.wsSocket = null;
    screensaverPromise.dataPromise = null;
  }

});

let putUpError = function( errorCode) {
  
  // Error handling if no image urls could be retrieved
  firstPicture.animateTo({a:0},1.0,scene.animation.TWEEN_STOP,scene.animation.OPTION_LOOP, 1);

  var postit = scene.create({t:"image", parent:root, x:1200, y:1200,  w:500, h:500, url:basePackageUri+"/images/post-it.png",
                             stretchX:scene.stretch.STRETCH,stretchY:scene.stretch.STRETCH,
                             a:0});
  var textBox = scene.create({t:"textBox", parent:postit,x:50, y:25, w:400, h: 400, textColor:0x000000FF, 
                              a:1, r:-2.6,
                              font:captionFont, //fontUrl:"https://px-apps.sys.comcast.net/pxscene-samples/examples/px-reference/fonts/XFINITYSansTT-Medium.ttf",
                              pixelSize:32, wordWrap:true, 
                              alignVertical:scene.alignVertical.CENTER, alignHorizontal:scene.alignHorizontal.CENTER,
                              text:"We're sorry, but something went wrong when attempting to get images to show for your screensaver."});
  var errorCode = scene.create({t:"textBox", parent:postit,x:50, y:425, w:400, h: 60, textColor:0x000000FF, 
                              a:1, r:-2.6,
                              font:captionFont,//fontUrl:"https://px-apps.sys.comcast.net/pxscene-samples/examples/px-reference/fonts/XFINITYSansTT-Medium.ttf",
                              pixelSize:24, wordWrap:true, 
                              alignHorizontal:scene.alignHorizontal.RIGHT,
                                text:"Error code: "+errorCode});

   postit.ready.then(function() {
    postit.animateTo({a:1,x:root.w/4, y:(root.h/2)-250 },1.5,scene.animation.TWEEN_STOP,scene.animation.OPTION_LOOP, 1);
    }).catch(error=> {
      console.log("postit promise was rejected");
    });
      
}


bg.ready.then(function() {
  
  console.log("PXAPP_VISIBLE");

  firstNewPicture();
// Handle promises and start the picture pile
  screensaverPromise.dataPromise.then(function(data) {

    console.log("PXAPP_PROCESS_1"); // JSON RECEIVED
    imageHandler.handleJson(data);
    if( imageHandler.getNumUrls() > 0) {
      doIt();
    }
    else {
      putUpError("SS0001");

    }

    }).catch(error=>{
        putUpError(error);
        });

});

module.exports.wantsClearscreen = function() 
{
  return false;
};

  
}).catch( function importFailed(err){
  console.error("Import failed for ss_pp.js: " + err)
});




