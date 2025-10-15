// Main Controller
//
// Made with Easy Lens



try {

// @input SceneObject targetObject
// @input Component.Camera camera
// @input float lookAtBlend = 0.3 {"widget":"slider", "min":0.0, "max":1.0}
// @input vec3 additionalEulerRotation = {0,0,0} // In degrees

function slerp(q1, q2, t) {
    // Spherical linear interpolation of quaternions
    // Clamp t between 0 and 1
    t = Math.max(0, Math.min(1, t));
    var dot = quat.dot(q1, q2);

    // If the dot product is negative, slerp won't take
    // the shorter path, so fix by reversing one quaternion
    if (dot < 0.0) {
        q2 = quat.negate(q2);
        dot = -dot;
    }

    if (dot > 0.995) {
        // If quaternions are very close, use linear interpolation
        var result = quat.lerp(q1, q2, t);
        return quat.normalize(result);
    }

    var theta_0 = Math.acos(dot);
    var theta = theta_0 * t;
    var sin_theta = Math.sin(theta);
    var sin_theta_0 = Math.sin(theta_0);

    var s0 = Math.cos(theta) - dot * sin_theta / sin_theta_0;
    var s1 = sin_theta / sin_theta_0;

    var res = quat.add(
        quat.multiply(q1, s0),
        quat.multiply(q2, s1)
    );
    return quat.normalize(res);
}

function updatePartialLookAt() {
    var targetTransform = script.targetObject.getTransform();
    var cameraTransform = script.camera.getTransform();

    // Get world positions
    var objectPos = targetTransform.getWorldPosition();
    var cameraPos = cameraTransform.getWorldPosition();

    // Calculate direction from object to camera
    var toCamera = cameraPos.sub(objectPos).normalize();
    var up = vec3.up();

    // Compute the full look-at rotation
    var lookAtQuat = quat.lookAt(toCamera, up);

    // Get the object's current world rotation
    var currQuat = targetTransform.getWorldRotation();

    // Slerp between the current rotation and the look-at rotation
    var partialLookAtQuat = slerp(currQuat, lookAtQuat, script.lookAtBlend);

    // Additional Euler rotation (convert degrees to radians)
    var addEuler = script.additionalEulerRotation.uniformScale(Math.PI / 180.0);
    var additionalQuat = quat.fromEulerVec(addEuler);

    // Combine the partial look-at with the additional rotation
    // (apply additional rotation after partial look-at)
    var finalQuat = partialLookAtQuat.multiply(additionalQuat);

    // Set the object's world rotation
    targetTransform.setWorldRotation(finalQuat);
}

// Bind to UpdateEvent so it updates every frame
var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(updatePartialLookAt);

} catch(e) {
  print("error in controller");
  print(e);
}
