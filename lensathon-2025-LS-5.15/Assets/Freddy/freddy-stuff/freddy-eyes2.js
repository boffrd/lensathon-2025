// @input SceneObject targetObject
// @input Component.Camera camera
// @input vec3 additionalEulerRotation = {0,0,0} // In degrees

function updateLookAt() {
    var targetTransform = script.targetObject.getTransform();
    var cameraTransform = script.camera.getTransform();

    // Get world positions
    var objectPos = targetTransform.getWorldPosition();
    var cameraPos = cameraTransform.getWorldPosition();

    // Calculate direction from object to camera
    var toCamera = cameraPos.sub(objectPos).normalize();

    // Define the up vector (usually Y axis)
    var up = vec3.up();

    // Calculate the look-at rotation (object's forward will point at camera)
    var lookAtQuat = quat.lookAt(toCamera, up);

    // Convert additional Euler rotation from degrees to radians
    var addEuler = script.additionalEulerRotation.uniformScale(Math.PI / 180.0);
    var additionalQuat = quat.fromEulerVec(addEuler);

    // Combine the look-at rotation with the additional rotation
    // The order matters: additionalQuat * lookAtQuat applies additional rotation after look-at
    var finalQuat = lookAtQuat.multiply(additionalQuat);

    // Set the object's world rotation
    targetTransform.setWorldRotation(finalQuat);
}

// Bind to UpdateEvent so it updates every frame
var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(updateLookAt);