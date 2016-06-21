/// <reference path="../../typings/index.d.ts"/>

// When we distribute Argon typings, we can get rid of this, but for now
// we need to shut up the Typescript compiler about missing Argon typings
declare const Argon:any;

// set up Argon
const app = Argon.init();

// Tell argon what local coordinate system you want.  The default coordinate
// frame used by Argon is Cesium's FIXED frame, which is centered at the center
// of the earth and oriented with the earth's axes.  
// The FIXED frame is inconvenient for a number of reasons: the numbers used are
// large and cause issues with rendering, and the orientation of the user's "local
// view of the world" is different that the FIXED orientation (my perception of "up"
// does not correspond to one of the FIXED axes).  
// Therefore, Argon uses a local coordinate frame that sits on a plane tangent to 
// the earth near the user's current location.  This frame automatically changes if the
// user moves more than a few kilometers.
// The EUS frame cooresponds to the typical 3D computer graphics coordinate frame, so we use
// that here.  The other option Argon supports is localOriginEastNorthUp, which is
// more similar to what is used in the geospatial industry
app.context.setDefaultReferenceFrame(app.context.localOriginEastUpSouth);

// set up THREE.  Create a scene, a perspective camera and an object
// for the stones target.  Do not add the stones target content to the scene yet
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const stonesObject = new THREE.Object3D();
scene.add(camera);

// variable for the dat.GUI() instance
var gui;

// create an object to put the head in, which is then added to the object attached to the 
// stones target
const headModel = new THREE.Object3D();
stonesObject.add(headModel);

// We use the standard WebGLRenderer when we only need WebGL-based content
const renderer = new THREE.WebGLRenderer({ 
    alpha: true, 
    //logarithmicDepthBuffer: true,
    antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio);
app.view.element.appendChild(renderer.domElement);

// our HUD renderer for 2D screen-fixed content.  This deals with stereo viewing in argon
const hud = new (<any>THREE).CSS3DArgonHUD();
var description = document.getElementById( 'description' );
hud.hudElements[0].appendChild(description);
app.view.element.appendChild(hud.domElement);

// This application is based on the Decals demo for three.js.  We had to change
// it to deal with the fact that the content is NOT attached to the origin of 
// the scene.  In the original demo, all content was added to the scene, and 
// many of the computations assumed the head was positioned at the origin of 
// the world with the identity orientation. 

// variables for the application 
var mesh, decal;
var line;

var intersection = {
    intersects: false,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3()
};

var mouse = new THREE.Vector2();

var textureLoader = new THREE.TextureLoader();
var decalDiffuse = textureLoader.load( '../resources/textures/decal/decal-diffuse.png' );
var decalNormal = textureLoader.load( '../resources/textures/decal/decal-normal.jpg' );

var decalMaterial = new THREE.MeshPhongMaterial( {
    specular: 0x444444,
    map: decalDiffuse,
    normalMap: decalNormal,
    normalScale: new THREE.Vector2( 1, 1 ),
    shininess: 30,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: - 4,
    wireframe: false
} );

var decals = [];
var p = new THREE.Vector3( 0, 0, 0 );
var r = new THREE.Vector3( 0, 0, 0 );
var s = new THREE.Vector3( 10, 10, 10 );
var up = new THREE.Vector3( 0, 1, 0 );
var check = new THREE.Vector3( 1, 1, 1 );

var params = {
    projection: 'normal',
    minScale: 10,
    maxScale: 20,
    rotate: true,
    clear: function() {
        removeDecals();
    }
};

scene.add( new THREE.AmbientLight( 0x443333 ) );

var light = new THREE.DirectionalLight( 0xffddcc, 1 );
light.position.set( 1, 0.75, 0.5 );
scene.add( light );

var light = new THREE.DirectionalLight( 0xccccff, 1 );
light.position.set( -1, 0.75, -0.5 );
scene.add( light );

var geometry = new THREE.Geometry();
geometry.vertices.push( new THREE.Vector3(), new THREE.Vector3() );

// add to the headModel node, not the scene
line = new THREE.Line( geometry, new THREE.LineBasicMaterial( { linewidth: 4 } ) );
headModel.add( line );

// leave mouseHelper in the scene, since it will get positioned/oriented in world coordinates
var raycaster = new THREE.Raycaster();
var mouseHelper = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 10 ), new THREE.MeshNormalMaterial() );
mouseHelper.visible = false;
scene.add( mouseHelper );

window.addEventListener( 'load', init );

function init() {
    loadLeePerrySmith();

    // Support both mouse and touch.
    renderer.domElement.addEventListener( 'mouseup', function(event:MouseEvent) {
        var x = event.clientX;
        var y = event.clientY;
        mouse.x = ( x / window.innerWidth ) * 2 - 1;
        mouse.y = - ( y / window.innerHeight ) * 2 + 1;
        
        checkIntersection();
        if (intersection.intersects )  shoot();
    });

    renderer.domElement.addEventListener( 'touchstart', function (event:TouchEvent) {
		var x = event.changedTouches[ 0 ].pageX;
        var y = event.changedTouches[ 0 ].pageY;
        mouse.x = ( x / window.innerWidth ) * 2 - 1;
        mouse.y = - ( y / window.innerHeight ) * 2 + 1;
        // prevent touches from emiting mouse events 
        event.preventDefault();
    }, false );

    renderer.domElement.addEventListener( 'touchend', function(event:TouchEvent) {
		var x = event.changedTouches[ 0 ].pageX;
        var y = event.changedTouches[ 0 ].pageY;
        mouse.x = ( x / window.innerWidth ) * 2 - 1;
        mouse.y = - ( y / window.innerHeight ) * 2 + 1;

        // only do touches in mono mode
        if (monoMode) {
            checkIntersection();
            if (intersection.intersects ) requestAnimationFrame(shoot);
        }

        // prevent touches from emiting mouse events
        event.preventDefault();
    } );

    renderer.domElement.addEventListener( 'touchmove', onTouchMove );
    renderer.domElement.addEventListener( 'mousemove', onTouchMove );

    function onTouchMove( event:TouchEvent|MouseEvent ) {
        var x,y: number;
        if ( event instanceof TouchEvent ) {

            x = event.changedTouches[ 0 ].pageX;
            y = event.changedTouches[ 0 ].pageY;

        } else {

            x = event.clientX;
            y = event.clientY;

        }

        mouse.x = ( x / window.innerWidth ) * 2 - 1;
        mouse.y = - ( y / window.innerHeight ) * 2 + 1;

        // only do touches in mono mode
        if (monoMode) {
            checkIntersection();
        }

        event.preventDefault();
    }

    // add dat.GUI to the left HUD.  We hid it in stereo viewing, so we don't need to 
    // figure out how to duplicate it.
    gui = new dat.GUI({ autoPlace: false });
    hud.hudElements[0].appendChild(gui.domElement);

    gui.add( params, 'projection', { 'From cam to mesh': 'camera', 'Normal to mesh': 'normal' } );
    gui.add( params, 'minScale', 1, 30 );
    gui.add( params, 'maxScale', 1, 30 );
    gui.add( params, 'rotate' );
    gui.add( params, 'clear' );
    gui.open();
}

// a temporary variable to hold the world inverse matrix.  Used to move values between
// scene (world) coordinates and the headModel coordinates, to make this demo work 
// when the head is not attached to the world
var invWorld = new THREE.Matrix4();

function checkIntersection() {

    if ( ! mesh ) return;

    // make sure everything is updated
    scene.updateMatrixWorld(true);

    raycaster.setFromCamera( mouse, camera );

    var intersects = raycaster.intersectObjects( [ mesh ] );

    if ( intersects.length > 0 ) {
        // get the transform from the world object back to the root of the scene
        invWorld.getInverse( headModel.matrixWorld );

        // need to move the point into "world" object instead of global scene coordinates

        var p = intersects[ 0 ].point;
        mouseHelper.position.copy( p );
        intersection.point.copy( p );

        var n = intersects[ 0 ].face.normal.clone();
        // the normal is in mesh coords, need it to be in world coords
        n.transformDirection(mesh.matrixWorld);

        intersection.normal.copy( intersects[ 0 ].face.normal );
        
        n.multiplyScalar( 10 );
        n.add( intersects[ 0 ].point );

        mouseHelper.lookAt( n );

        line.geometry.vertices[ 0 ].copy( intersection.point );
        line.geometry.vertices[ 1 ].copy( n );

        // move line coordinates to the headModel object coordinates, from the world
        line.geometry.vertices[0].applyMatrix4(invWorld);
        line.geometry.vertices[1].applyMatrix4(invWorld);

        line.geometry.verticesNeedUpdate = true;
        intersection.intersects = true;

    } else {

        intersection.intersects = false;

    }

}


function loadLeePerrySmith() {

    var loader = new THREE.JSONLoader();

    loader.load( '../resources/obj/leeperrysmith/LeePerrySmith.js', function( geometry ) {

        var material = new THREE.MeshPhongMaterial( {
            specular: 0x111111,
            map: textureLoader.load( '../resources/obj/leeperrysmith/Map-COL.jpg' ),
            specularMap: textureLoader.load( '../resources/obj/leeperrysmith/Map-SPEC.jpg' ),
            normalMap: textureLoader.load( '../resources/obj/leeperrysmith/Infinite-Level_02_Tangent_SmoothUV.jpg' ),
            normalScale: new THREE.Vector2( 0.75, 0.75 ),
            shininess: 25
        } );

        mesh = new THREE.Mesh( geometry, material );

        // add the model to the headModel object, not the scene
        headModel.add( mesh );
        mesh.scale.set( 20, 20, 20 );
        mesh.rotation.x = THREE.Math.degToRad(90);
    } );
}

function shoot() {
    
    if ( params.projection == 'camera' ) {

        var dir = headModel.getWorldPosition();
        var camPos = camera.getWorldPosition();
        dir.sub( camPos );

        p = intersection.point;

        var m = new THREE.Matrix4();
        var c = dir.clone();
        c.negate();
        c.multiplyScalar( 10 );
        c.add( p );
        m.lookAt( p, c, up );

        // put the rotation in headModel object coordinates
        m.multiplyMatrices(invWorld, m);
        m = m.extractRotation( m );

        var dummy = new THREE.Object3D();
        dummy.rotation.setFromRotationMatrix( m );
        r.set( dummy.rotation.x, dummy.rotation.y, dummy.rotation.z );

    } else {
        p = intersection.point;

        var m = new THREE.Matrix4();
        // get the mouseHelper orientation in headModel coordinates
        m.multiplyMatrices(invWorld, mouseHelper.matrixWorld);

        var dummy = new THREE.Object3D();
        dummy.rotation.setFromRotationMatrix( m );
        r.set( dummy.rotation.x, dummy.rotation.y, dummy.rotation.z );
    }

    // move p to headModel object coordinates from world
    p = p.clone();
    p.applyMatrix4(invWorld);

    var scale = params.minScale + Math.random() * ( params.maxScale - params.minScale );
    s.set( scale, scale, scale );

    if ( params.rotate ) r.z = Math.random() * 2 * Math.PI;

    var material = decalMaterial.clone();
    material.color.setHex( Math.random() * 0xffffff );

    // mesh is in headModel coordinates, to p & r have also been moved into headModel coords
    var m2 = new THREE.Mesh( new THREE.DecalGeometry( mesh, p, r, s, false ), material );
    decals.push( m2 );
    headModel.add( m2 );
}

function removeDecals() {

    decals.forEach( function( d ) {

        headModel.remove( d );
        d = null;

    } );
    decals = [];

}

function mergeDecals() {

    var merge = {};
    decals.forEach( function ( decal ) {

        var uuid = decal.material.uuid;
        var d = merge[ uuid ] = merge[ uuid ] || {};
        d.material = d.material || decal.material;
        d.geometry = d.geometry || new THREE.Geometry();
        d.geometry.merge( decal.geometry, decal.matrix );

    } );

    removeDecals();

    for ( var key in merge ) {

        var d = merge[ key ];
        var mesh = new THREE.Mesh( d.geometry, d.material );
        headModel.add( mesh );
        decals.push( mesh );

    }

}

// tell argon to initialize vuforia for our app, using our license information.
app.vuforia.init({
	licenseKey: "AXRIsu7/////AAAAAaYn+sFgpkAomH+Z+tK/Wsc8D+x60P90Nz8Oh0J8onzjVUIP5RbYjdDfyatmpnNgib3xGo1v8iWhkU1swiCaOM9V2jmpC4RZommwQzlgFbBRfZjV8DY3ggx9qAq8mijhN7nMzFDMgUhOlRWeN04VOcJGVUxnKn+R+oot1XTF5OlJZk3oXK2UfGkZo5DzSYafIVA0QS3Qgcx6j2qYAa/SZcPqiReiDM9FpaiObwxV3/xYJhXPUGVxI4wMcDI0XBWtiPR2yO9jAnv+x8+p88xqlMH8GHDSUecG97NbcTlPB0RayGGg1F6Y7v0/nQyk1OIp7J8VQ2YrTK25kKHST0Ny2s3M234SgvNCvnUHfAKFQ5KV"
}).then((api)=>{
    // the vuforia API is ready, so we can start using it.

    // tell argon to download a vuforia dataset.  The .xml and .dat file must be together
    // in the web directory, even though we just provide the .xml file url here 
    api.objectTracker.createDataSet('../resources/datasets/StonesAndChips.xml').then( (dataSet)=>{
        // the data set has been succesfully downloaded

        // tell vuforia to load the dataset.  
        dataSet.load().then(()=>{
            // when it is loaded, we retrieve a list of trackables defined in the
            // dataset and set up the content for the target
            const trackables = dataSet.getTrackables();
            
            // tell argon we want to track a specific trackable.  Each trackable
            // has a Cesium entity associated with it, and is expressed in a 
            // coordinate frame relative to the camera.  Because they are Cesium
            // entities, we can ask for their pose in any coordinate frame we know
            // about.
            const stonesEntity = app.context.subscribeToEntityById(trackables['stones'].id)
            
            // the updateEvent is called each time the 3D world should be
            // rendered, before the renderEvent.  The state of your application
            // should be updated here.
            app.context.updateEvent.addEventListener(() => {
                // get the pose (in local coordinates) of the stones target
                const stonesPose = app.context.getEntityPose(stonesEntity);

                // if the pose is known the target is visible, so set the
                // THREE object to it's location and orientation
                if (stonesPose.poseStatus & Argon.PoseStatus.KNOWN) {
                    stonesObject.position.copy(stonesPose.position);
                    stonesObject.quaternion.copy(stonesPose.orientation);
                }
                
                // when the target is first seen after not being seen, the 
                // status is FOUND.  Add the stonesObject content to the target.
                // when the target is first lost after being seen, the status 
                // is LOST.  Here, we remove the stonesObject, removing all the
                // content attached to the target from the world.
                if (stonesPose.poseStatus & Argon.PoseStatus.FOUND) {
                    scene.add (stonesObject);
                    headModel.position.set(0,0,80);
                } else if (stonesPose.poseStatus & Argon.PoseStatus.LOST) {
                    scene.remove (stonesObject);
                }
                
            })
        });
        
        // activate the dataset.
        api.objectTracker.activateDataSet(dataSet);
    });
}).catch(()=>{
    // if we're not running in Argon, we'll position the headModel in front of the camera
    // in the world, so we see something and can test
    if (app.session.isManager) {
        app.context.updateEvent.addEventListener(() => {
            const userPose = app.context.getEntityPose(app.context.user);

            if (userPose.poseStatus & Argon.PoseStatus.KNOWN) {
                headModel.position.copy(userPose.position);
                headModel.quaternion.copy(userPose.orientation);
                headModel.translateZ(-160);
                headModel.rotateX(-Math.PI/2);
            }
            
            if (userPose.poseStatus & Argon.PoseStatus.FOUND) {
                scene.add (headModel);
            }
        })
    }
})

// make a note of if we're in mono or stereo mode, for use in the touch callbacks
var monoMode = false;

// renderEvent is fired whenever argon wants the app to update its display
app.renderEvent.addEventListener(() => {
    // if we have 1 subView, we're in mono mode.  If more, stereo.
    monoMode = (app.view.getSubviews()).length == 1;

    // set the renderer to know the current size of the viewport.
    // This is the full size of the viewport, which would include
    // both views if we are in stereo viewing mode
    const viewport = app.view.getViewport();
    renderer.setSize(viewport.width, viewport.height);
    hud.setSize(viewport.width, viewport.height);
    
    for (let subview of app.view.getSubviews()) {
        // set the position and orientation of the camera for 
        // this subview
        camera.position.copy(subview.pose.position);
        camera.quaternion.copy(subview.pose.orientation);
        // the underlying system provide a full projection matrix
        // for the camera. 
        camera.projectionMatrix.fromArray(subview.projectionMatrix);

        // set the viewport for this view
        let {x,y,width,height} = subview.viewport;
        renderer.setViewport(x,y,width,height);

        // set the webGL rendering parameters and render this view
        renderer.setScissor(x,y,width,height);
        renderer.setScissorTest(true);
        renderer.render(scene, camera);

        if (monoMode) {
            // adjust the hud, but only in mono mode. 
            hud.setViewport(x,y,width,height, subview.index);
            hud.render(subview.index);
        }
    }
})