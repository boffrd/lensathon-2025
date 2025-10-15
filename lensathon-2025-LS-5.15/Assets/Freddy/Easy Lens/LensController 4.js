// Main Controller
//
// Made with Easy Lens



try {

// @input SceneObject targetObject
// @input Component.Camera camera
// @input float lookAtBlend = 0.3 {"widget":"slider", "min":0.0, "max":1.0}
// @input vec3 additionalEulerRotation = {0,0,0} // In degrees

// Helper: Quaternion SLERP for Lens Studio (if not built-in)
function slerp(q1, q2, t) {
    t = Math.max(0, Math.min(1, t));
    var dot = quat.dot(q1, q2);

    if (dot < 0.0) {
        q2 = quat.negate(q2);
        dot = -dot;
    }

    if (dot > 0.995) {
        // Linear interpolation for very close quaternions
        var lerped = quat.lerp(q1, q2, t);
        return quat.normalize(lerped);
    }

    var theta_0 = Math.acos(dot);
    var theta = theta_0 * t;
    var sin_theta = Math.sin(theta);
    var sin_theta_0 = Math.sin(theta_0);

    var s0 = Math.cos(theta) - dot * sin_theta / sin_theta_0;
    var s1 = sin_theta / sin_theta_0;

    // Manual weighted blend for Lens Studio (no operator overloading)
    var q1w = q1.w * s0, q1x = q1.x * s0, q1y = q1.y * s0, q1z = q1.z * s0;
    var q2w = q2.w * s1, q2x = q2.x * s1, q2y = q2.y * s1, q2z = q2.z * s1;
    var result = new quat(q1x + q2x, q1y + q2y, q1z + q2z, q1w + q2w);

    return quat.normalize(result);
}

function updatePartialLookAt() {
    if (!script.targetObject || !script.camera) {
        // Make sure the script inputs are set
        return;
    }
    var targetTransform = script.targetObject.getTransform();
    var cameraTransform = script.camera.getTransform();
    if (!targetTransform || !cameraTransform) {
        return;
    }

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
    var addEuler = new vec3(
        script.additionalEulerRotation.x * Math.PI / 180.0,
        script.additionalEulerRotation.y * Math.PI / 180.0,
        script.additionalEulerRotation.z * Math.PI / 180.0
    );
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
