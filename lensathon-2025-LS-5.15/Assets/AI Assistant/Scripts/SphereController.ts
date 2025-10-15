/*
 * SphereController - AI Assistant Orb Controller
 * 
 * Modified to display the orb as a floating element that is always visible in front of the user.
 * The orb no longer depends on hand tracking position and instead smoothly follows the user's view.
 * 
 * Key Features:
 * - Configurable lerp intensity for smooth movement
 * - Adjustable distance from user
 * - Customizable position offset (right, up, forward)
 * - Always visible floating orb (not tied to hand position)
 * - Smooth transitions between minimized and expanded states
 */

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { LSTween } from "LSTween.lspkg/LSTween";
import Easing from "LSTween.lspkg/TweenJS/Easing";
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation";

import { HandInputData } from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

@component
export class SphereController extends BaseScriptComponent {
  @ui.separator
  @ui.label("Manages the UI and hand intereactions for the AI assistant")
  @ui.separator
  
  @ui.group_start("Orb Positioning Settings")
  @input
  @ui.label("Controls how smoothly the orb follows the user (lower = smoother)")
  private lerpIntensity: number = 0.15; // Increased for more responsive following

  @input
  @ui.label("Distance from user to the orb")
  private distanceToUser: number = 60; // Closer to user for better visibility

  @input
  @ui.label("Position offset relative to user (right, up, forward)")
  private positionOffset: vec3 = new vec3(20, 5, 0); // Positive values for right/up, 0 forward
  
  @input
  @ui.label("How quickly orb returns to view when out of FOV")
  private returnToViewSpeed: number = 0.3;
  @ui.group_end

  @ui.separator
  @ui.group_start("Hover/Float Animation (Jetpack Effect)")
  @input
  @ui.label("Enable floating/hovering animation loop")
  private enableHoverAnimation: boolean = true;
  
  @input
  @ui.label("Vertical hover distance (up/down movement)")
  private hoverVerticalDistance: number = 3.0;
  
  @input
  @ui.label("Horizontal hover distance (left/right movement)")
  private hoverHorizontalDistance: number = 2.0;
  
  @input
  @ui.label("Animation loop duration (seconds)")
  private hoverAnimationDuration: number = 7.0;
  
  @input
  @ui.label("Vertical speed multiplier (affects up/down frequency)")
  private verticalSpeedMultiplier: number = 1.0;
  
  @input
  @ui.label("Horizontal speed multiplier (affects left/right frequency)")
  private horizontalSpeedMultiplier: number = 0.7;
  
  @input
  @ui.label("Movement target (orb will apply hover animation to this object)")
  private movementTarget: SceneObject;
  @ui.group_end

  @ui.separator
  @ui.group_start("Audio Reactivity")
  @input
  @ui.label("GeminiAssistant reference for audio reactivity")
  private geminiAssistant: ScriptComponent;
  
  @input
  @widget(new SliderWidget(0.1, 5.0, 0.1))
  @ui.label("Multiplier for audio reactive width effect")
  private audioReactiveMultiplier: number = 2.0;
  
  @input
  @widget(new SliderWidget(0.01, 1.0, 0.01))
  @ui.label("Smoothing factor for audio reactive animation")
  private audioSmoothingFactor: number = 0.2;
  
  @input
  @widget(new SliderWidget(0.1, 2.0, 0.1))
  @ui.label("Base width value when no audio is playing")
  private baseWidth: number = 1.0;
  
  @input
  @widget(new SliderWidget(0.01, 0.5, 0.01))
  @ui.label("How fast the width returns to base when audio stops")
  private audioDecayRate: number = 0.1;
  @ui.group_end
  
  @ui.separator
  @ui.group_start("Interaction Settings")
  @input
  @ui.label("Allow user to click/pinch to minimize the orb")
  private allowUserInteraction: boolean = false;
  @ui.group_end

  @ui.separator
  @ui.group_start("Materials & Objects")
  @input
  private hoverMat: Material;

  @input
  private orbInteractableObj: SceneObject;

  @input
  private orbObject: SceneObject;

  @input
  private orbVisualParent: SceneObject;

  @input
  private orbScreenPosition: SceneObject;

  @input
  private closeObj: SceneObject;

  @input
  private closeButtonInteractable: SceneObject;

  @input
  private worldSpaceText: Text;

  @input
  private screenSpaceText: Text;

  @input
  private uiParent: SceneObject;
  @ui.group_end

  private wasInFOV: boolean = true;

  private interactable: Interactable;
  private manipulate: InteractableManipulation;
  private orbButton: PinchButton;
  private closeButton: PinchButton;

  // Get SIK data
  private handProvider: HandInputData = HandInputData.getInstance();
  private menuHand = this.handProvider.getHand("left");

  private trackedToHand: boolean = false; // Changed to false - orb is always floating
  private wcfmp = WorldCameraFinderProvider.getInstance();

  private minimizedSize: vec3 = vec3.one().uniformScale(0.3);
  private fullSize: vec3 = vec3.one();
  private reducedSize: vec3 = vec3.one().uniformScale(0.7); // 30% smaller than full size

  // Target position for smooth lerping
  private targetPosition: vec3 = vec3.zero();
  private isOrbVisible: boolean = true;
  
  // State tracking for size reduction
  private isOrbSizeReduced: boolean = false;
  
  // Position offset for reduced mode
  private reducedModeOffset: vec3 = new vec3(-3, 0, 0); // Move left by 3 units when reduced
  private originalPositionOffset: vec3; // Store original offset

  // Audio reactivity properties
  private currentAudioLevel: number = 0.0;
  private targetAudioLevel: number = 0.0;
  private currentWidth: number = 1.0;
  private isAudioPlaying: boolean = false;
  private audioSamples: Float32Array | null = null;
  private lastAudioTime: number = 0;
  private silenceTimer: number = 0;
  private readonly SILENCE_THRESHOLD = 0.01;
  private readonly SILENCE_TIMEOUT = 200; // ms

  // Hover animation properties
  private hoverAnimationTime: number = 0;
  private hoverOffset: vec3 = vec3.zero();

  public isActivatedEvent: Event<boolean> = new Event<boolean>();

  onAwake() {
    this.interactable = this.orbInteractableObj.getComponent(
      Interactable.getTypeName()
    );
    this.manipulate = this.orbInteractableObj.getComponent(
      InteractableManipulation.getTypeName()
    );
    this.orbButton = this.orbInteractableObj.getComponent(
      PinchButton.getTypeName()
    );
    if (this.closeButtonInteractable) {
      this.closeButton = this.closeButtonInteractable.getComponent(
        PinchButton.getTypeName()
      );
    }
    this.setOrbState(false); // Start in minimized state
    this.createEvent("OnStartEvent").bind(this.init.bind(this));
    this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
    this.hoverMat.mainPass.activeHover = 1.0; // Always visible instead of 0
    
    // Store original position offset for restoration
    this.originalPositionOffset = new vec3(this.positionOffset.x, this.positionOffset.y, this.positionOffset.z);
    
    // Start completely hidden - will be shown by StateManager when appropriate
    this.uiParent.enabled = false;
    this.hideOrb();
    
    // Initialize target position
    this.updateTargetPosition();
  }

  initializeUI() {
    this.uiParent.enabled = true;
  }

  private updateTargetPosition() {
    // Calculate the target position in front of the user with offset
    let cameraPosition = this.wcfmp.getWorldPosition();
    let cameraForward = this.wcfmp.forward();
    let cameraRight = this.wcfmp.right();
    let cameraUp = this.wcfmp.up();
    
    // Use current position offset (which changes based on reduced mode)
    const currentOffset = this.isOrbSizeReduced ? 
      this.originalPositionOffset.add(this.reducedModeOffset) : 
      this.originalPositionOffset;
    
    // IMPORTANT: Use negative forward to place orb in front of camera
    // In Lens Studio, camera forward might point backwards relative to user view
    let forwardOffset = cameraForward.uniformScale(-this.distanceToUser); // Negative for in front
    let rightOffset = cameraRight.uniformScale(currentOffset.x);
    let upOffset = cameraUp.uniformScale(currentOffset.y);
    let additionalForward = cameraForward.uniformScale(-currentOffset.z); // Negative for consistent direction
    
    this.targetPosition = cameraPosition
      .add(forwardOffset)
      .add(rightOffset)
      .add(upOffset)
      .add(additionalForward);
      
    // Ensure orb stays in field of view by adjusting position if needed
    this.adjustForFieldOfView();
  }
  
  /**
   * Update the hover animation to create a floating jetpack-like effect
   * Creates smooth sinusoidal motion in vertical and horizontal directions
   */
  private updateHoverAnimation() {
    // Increment animation time based on delta time
    const deltaTime = getDeltaTime();
    this.hoverAnimationTime += deltaTime;
    
    // Prevent time from growing infinitely
    if (this.hoverAnimationTime > this.hoverAnimationDuration * 100) {
      this.hoverAnimationTime = 0;
    }
    
    // Calculate normalized time (0 to 1) based on animation duration
    const frequency = 1.0 / this.hoverAnimationDuration;
    const time = this.hoverAnimationTime * frequency;
    
    // Create vertical (up/down) motion using sine wave
    // Use different frequency for vertical motion to create more natural feel
    const verticalPhase = time * Math.PI * 2 * this.verticalSpeedMultiplier;
    const verticalOffset = Math.sin(verticalPhase) * this.hoverVerticalDistance;
    
    // Create horizontal (left/right) motion using cosine wave
    // Offset by 90 degrees (cosine) for figure-8 or circular motion
    // Use different frequency for horizontal to avoid perfect synchronization
    const horizontalPhase = time * Math.PI * 2 * this.horizontalSpeedMultiplier;
    const horizontalOffset = Math.cos(horizontalPhase) * this.hoverHorizontalDistance;
    
    // Apply the hover offset
    this.hoverOffset = new vec3(horizontalOffset, verticalOffset, 0);
    
    // Debug output (log every 60 frames to avoid spam)
    if (Math.floor(this.hoverAnimationTime * 60) % 60 === 0) {
      print(`[SphereController] Hover Animation - Vertical: ${verticalOffset.toFixed(2)}, Horizontal: ${horizontalOffset.toFixed(2)}`);
    }
  }
  
  /**
   * Adjust target position to ensure orb stays in user's field of view
   */
  private adjustForFieldOfView() {
    // Get camera vectors
    let cameraPosition = this.wcfmp.getWorldPosition();
    let cameraForward = this.wcfmp.forward();
    let cameraRight = this.wcfmp.right();
    let cameraUp = this.wcfmp.up();
    
    // Use current position offset (which changes based on reduced mode)
    const currentOffset = this.isOrbSizeReduced ? 
      this.originalPositionOffset.add(this.reducedModeOffset) : 
      this.originalPositionOffset;
    
    // Calculate direction from camera to target position
    let directionToTarget = this.targetPosition.sub(cameraPosition).normalize();
    
    // Use negative forward since we corrected the direction above
    let viewDirection = cameraForward.uniformScale(-1); // Corrected view direction
    
    // Check if target is within field of view (roughly 45 degrees from center)
    let dotProduct = directionToTarget.dot(viewDirection);
    let angleFromCenter = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
    let maxAngle = Math.PI / 4; // 45 degrees
    
    // If outside FOV, adjust position to bring it back into view
    if (angleFromCenter > maxAngle) {
      // Calculate a position that's within the FOV
      let adjustedDirection = viewDirection.add(cameraRight.uniformScale(currentOffset.x / 40));
      adjustedDirection = adjustedDirection.add(cameraUp.uniformScale(currentOffset.y / 40));
      adjustedDirection = adjustedDirection.normalize();
      
      this.targetPosition = cameraPosition.add(adjustedDirection.uniformScale(this.distanceToUser));
    }
  }

  private setOrbState(isExpanded: boolean) {
    this.trackedToHand = !isExpanded;
    this.manipulate.enabled = isExpanded;
    
    if (!isExpanded) {
      // Minimized state - orb floats in front of user
      LSTween.scaleToLocal(
        this.orbObject.getTransform(),
        this.minimizedSize,
        600
      )
        .easing(Easing.Quadratic.InOut)
        .start();

      if (this.closeObj && this.closeButton) {
        LSTween.scaleToLocal(
          this.closeObj.getTransform(),
          vec3.one().uniformScale(0.1),
          600
        )
          .easing(Easing.Quadratic.InOut)
          .onComplete(() => {
            this.closeButton.sceneObject.enabled = false;
          })
          .start();
      }
      this.screenSpaceText.enabled = false;
      this.worldSpaceText.enabled = false;
    } else {
      // Expanded state - orb is larger and interactive
      // Check if we should use reduced size instead of full size
      const targetSize = this.isOrbSizeReduced ? this.reducedSize : this.fullSize;
      print(`[SphereController] Setting orb to ${this.isOrbSizeReduced ? 'REDUCED' : 'FULL'} size: ${targetSize}`);
      
      LSTween.scaleToLocal(this.orbObject.getTransform(), targetSize, 400)
        .easing(Easing.Quadratic.InOut)
        .start();

      if (this.closeButton && this.closeObj) {
        this.closeButton.sceneObject.enabled = true;
        const closeButtonSize = this.isOrbSizeReduced ? this.reducedSize : vec3.one();
        LSTween.scaleToLocal(this.closeObj.getTransform(), closeButtonSize, 600)
          .easing(Easing.Quadratic.InOut)
          .start();
      }
        
      // Choose text display based on reduced state
      if (this.isOrbSizeReduced) {
        // Use screen space text when reduced for better readability
        this.screenSpaceText.enabled = true;
        this.worldSpaceText.enabled = false;
      } else {
        // Use world space text when normal size
        this.screenSpaceText.enabled = false;
        this.worldSpaceText.enabled = true;
      }
    }

    this.isActivatedEvent.invoke(isExpanded);
  }

  private init() {
    // Only set up interactions if user interaction is allowed
    if (!this.allowUserInteraction) {
      // Disable all interactive components
      if (this.interactable) {
        this.interactable.enabled = false;
      }
      if (this.manipulate) {
        this.manipulate.enabled = false;
      }
      if (this.orbButton) {
        this.orbButton.enabled = false;
      }
      if (this.closeButton) {
        this.closeButton.enabled = false;
      }
      
      print("[SphereController] User interaction DISABLED - orb cannot be clicked or minimized");
      return;
    }
    
    // Original interaction setup (only if allowUserInteraction is true)
    // Hover material is now always visible, so no need for hover animations
    // this.interactable.onHoverEnter.add(() => {
    //   LSTween.rawTween(200)
    //     .onUpdate((tweenData) => {
    //       let percent = tweenData.t as number;
    //       this.hoverMat.mainPass.activeHover = percent;
    //     })
    //     .start();
    // });

    // this.interactable.onHoverExit.add(() => {
    //   LSTween.rawTween(200)
    //     .onUpdate((tweenData) => {
    //       let percent = 1 - (tweenData.t as number);
    //       this.hoverMat.mainPass.activeHover = percent;
    //     })
    //     .start();
    // });

    this.orbButton.onButtonPinched.add(() => {
      if (this.trackedToHand) {
        this.setOrbState(true);
      }
    });

    if (this.closeButton) {
      this.closeButton.onButtonPinched.add(() => {
        if (!this.trackedToHand) {
          this.setOrbState(false);
        }
      });
    }
  }

  private onUpdate() {
    this.updateTargetPosition();
    this.updateOrbPosition();
    this.updateOrbRotation();
    this.handleOrbVisibility();
    this.keepActiveOrbVisible();
    this.updateAudioReactivity();
  }
  
  /**
   * Update audio reactive effects based on AI voice audio
   */
  private updateAudioReactivity() {
    this.analyzeAudioLevel();
    this.updateWidthParameter();
  }
  
  /**
   * Analyze current audio level from GeminiAssistant
   */
  private analyzeAudioLevel() {
    if (!this.geminiAssistant) {
      this.targetAudioLevel = 0;
      return;
    }
    
    try {
      // Try to access DynamicAudioOutput from GeminiAssistant
      const geminiScript = this.geminiAssistant as any;
      const dynamicAudioOutput = geminiScript.dynamicAudioOutput;
      
      if (dynamicAudioOutput) {
        // Check if audio is currently playing
        const currentTime = Date.now();
        
        // Simple approach: detect if AI is speaking by checking text updates
        // This is more reliable than trying to analyze raw audio data
        const isCurrentlySpeaking = this.detectAISpeaking();
        
        if (isCurrentlySpeaking) {
          // Create a pulsing effect when AI is speaking
          const pulseFrequency = 3.0; // Hz
          const pulseAmplitude = 0.6;
          const time = currentTime / 1000.0;
          const pulseValue = Math.sin(time * pulseFrequency * Math.PI * 2) * pulseAmplitude + 0.4;
          
          this.targetAudioLevel = Math.max(0.2, Math.abs(pulseValue));
          this.isAudioPlaying = true;
          this.lastAudioTime = currentTime;
          this.silenceTimer = 0;
        } else {
          // Check for silence timeout
          if (currentTime - this.lastAudioTime > this.SILENCE_TIMEOUT) {
            this.targetAudioLevel = 0;
            this.isAudioPlaying = false;
          }
        }
      }
    } catch (error) {
      // Fallback: create subtle ambient animation
      const time = Date.now() / 1000.0;
      this.targetAudioLevel = Math.sin(time * 0.5) * 0.1 + 0.1;
    }
  }
  
  /**
   * Detect if AI is currently speaking by monitoring text updates
   */
  private detectAISpeaking(): boolean {
    // This is a simple heuristic - in a real implementation,
    // you might want to hook into the GeminiAssistant's text update events
    const currentTime = Date.now();
    
    // Check if we received recent audio data or text updates
    // This is a simplified approach - you could make this more sophisticated
    // by actually hooking into the Gemini audio stream
    
    return this.isAudioPlaying && (currentTime - this.lastAudioTime < this.SILENCE_TIMEOUT);
  }
  
  /**
   * Update the material width parameter based on audio level
   */
  private updateWidthParameter() {
    // Smooth the audio level changes
    this.currentAudioLevel = this.lerp(
      this.currentAudioLevel,
      this.targetAudioLevel,
      this.audioSmoothingFactor
    );
    
    // Calculate the target width based on audio level
    const audioWidth = this.baseWidth + (this.currentAudioLevel * this.audioReactiveMultiplier);
    
    // Apply decay when no audio
    if (!this.isAudioPlaying) {
      this.currentWidth = this.lerp(this.currentWidth, this.baseWidth, this.audioDecayRate);
    } else {
      this.currentWidth = this.lerp(this.currentWidth, audioWidth, this.audioSmoothingFactor);
    }
    
    // Update the material width parameter
    if (this.hoverMat && this.hoverMat.mainPass) {
      // Assuming the material has a "width" parameter
      try {
        this.hoverMat.mainPass.width = this.currentWidth;
      } catch (error) {
        // If "width" doesn't exist, try other common names
        try {
          this.hoverMat.mainPass.Width = this.currentWidth;
        } catch (error2) {
          // You might need to check the actual parameter name in your material
          print(`[SphereController] Could not find width parameter in material: ${error2}`);
        }
      }
    }
  }
  
  /**
   * Linear interpolation helper
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private updateOrbPosition() {
    // Always update position for both states - orb should follow user regardless of size
    if (!this.orbObject) {
      print("[SphereController] WARNING: orbObject is null!");
      return;
    }
    
    let objectToTransform = this.orbObject.getTransform();
    
    // Use different lerp speeds based on state for better UX
    let currentLerpSpeed = this.trackedToHand ? this.lerpIntensity : this.returnToViewSpeed;
    
    let currentPosition = objectToTransform.getWorldPosition();
    let newPosition = vec3.lerp(currentPosition, this.targetPosition, currentLerpSpeed);
    objectToTransform.setWorldPosition(newPosition);
    
    // Apply hover animation to the movement target
    if (this.enableHoverAnimation) {
      this.updateHoverAnimation();
      this.applyHoverToVisualParent();
    } else {
      this.hoverOffset = vec3.zero();
      const targetObject = this.movementTarget ? this.movementTarget : this.orbVisualParent;
      if (targetObject) {
        targetObject.getTransform().setLocalPosition(vec3.zero());
      }
    }
    
    // Also update close button position when expanded
    if (!this.trackedToHand && this.closeObj) {
      let closeTransform = this.closeObj.getTransform();
      let closeCurrentPos = closeTransform.getWorldPosition();
      let closeNewPos = vec3.lerp(closeCurrentPos, this.targetPosition, currentLerpSpeed);
      closeTransform.setWorldPosition(closeNewPos);
    }
  }
  
  /**
   * Apply hover animation offset to the visual parent in local space
   */
  private applyHoverToVisualParent() {
    // Use movementTarget if specified, otherwise fall back to orbVisualParent
    const targetObject = this.movementTarget ? this.movementTarget : this.orbVisualParent;
    
    if (!targetObject) {
      print("[SphereController] WARNING: No movement target or orbVisualParent set!");
      return;
    }
    
    // Apply the hover offset in local space relative to the orb object
    // This creates the floating effect without interfering with the position tracking
    targetObject.getTransform().setLocalPosition(this.hoverOffset);
  }

  private updateOrbRotation() {
    // Always update rotation for both the main orb and close button
    let cameraPosition = this.wcfmp.getWorldPosition();
    
    // Update main orb rotation
    if (this.orbObject) {
      let orbPosition = this.orbObject.getTransform().getWorldPosition();
      let direction = cameraPosition.sub(orbPosition).normalize();
      this.orbObject.getTransform().setWorldRotation(quat.lookAt(direction, vec3.up()));
    }
    
    // Update close button rotation when expanded
    if (!this.trackedToHand && this.closeObj) {
      let closePosition = this.closeObj.getTransform().getWorldPosition();
      let closeDirection = cameraPosition.sub(closePosition).normalize();
      this.closeObj.getTransform().setWorldRotation(quat.lookAt(closeDirection, vec3.up()));
    }
  }

  private handleOrbVisibility() {
    // Keep the orb always visible - it should follow the user and stay in view
    let shouldBeVisible = true;
    
    // Only hide in very specific cases (like when explicitly disabled)
    if (!global.deviceInfoSystem.isEditor()) {
      // In device mode, we might want to check hand tracking status
      // but still keep the orb visible since it's no longer hand-dependent
      shouldBeVisible = true;
    }

    // Apply visibility to both orb states
    if (this.orbObject) {
      this.orbObject.enabled = shouldBeVisible;
    }
    
    if (!this.trackedToHand && this.closeObj) {
      this.closeObj.enabled = shouldBeVisible;
    }
  }

  private setOrbToScreenPosition(inScrPos: boolean) {
    // This method is simplified since the orb is always in world space now
    // Keeping for compatibility but the logic is much simpler
    if (!inScrPos) {
      this.orbVisualParent.setParent(this.orbScreenPosition);
      this.orbVisualParent.getTransform().setLocalPosition(vec3.zero());
      LSTween.scaleFromToLocal(
        this.orbVisualParent.getTransform(),
        vec3.one().uniformScale(0.01),
        vec3.one().uniformScale(0.3),
        200
      ).start();
      this.screenSpaceText.enabled = true;
      this.worldSpaceText.enabled = false;
    } else {
      this.orbVisualParent.setParent(this.orbObject);
      this.orbVisualParent.getTransform().setLocalPosition(vec3.zero());
      LSTween.scaleToLocal(
        this.orbVisualParent.getTransform(),
        vec3.one(),
        200
      ).start();
      this.screenSpaceText.enabled = false;
      this.worldSpaceText.enabled = true;
    }
  }

  private keepActiveOrbVisible() {
    // Simplified - orb is always visible in world space now
    // No need for FOV checks since orb follows the user
    if (this.trackedToHand) {
      return;
    }
    
    // Keep the orb in world space since it's always positioned in front of user
    if (!this.wasInFOV) {
      this.setOrbToScreenPosition(true); // Always use world space
      this.wasInFOV = true;
    }
  }

  public setText(data: { text: string; completed: boolean }) {
    // Always ensure world space text is enabled and visible
    this.worldSpaceText.enabled = true;
    
    if (data.completed) {
      this.worldSpaceText.text = data.text;
      this.screenSpaceText.text = data.text;
      // Print complete text only when turn is complete
      print(`💬 Complete text: ${data.text}`);
    } else {
      this.worldSpaceText.text += data.text;
      this.screenSpaceText.text += data.text;
    }
  }

  /**
   * Sync text between world space and screen space text components
   * Useful when switching between display modes
   */
  private syncTextDisplays() {
    // Sync text content between both text components
    if (this.worldSpaceText.text && !this.screenSpaceText.text) {
      this.screenSpaceText.text = this.worldSpaceText.text;
    } else if (this.screenSpaceText.text && !this.worldSpaceText.text) {
      this.worldSpaceText.text = this.screenSpaceText.text;
    }
  }

  /**
   * Automatically activate the orb (for use by StateManager to skip manual interaction)
   */
  public autoActivate() {
    print("[SphereController] Auto-activating orb");
    this.setOrbState(true);
  }

  /**
   * Hide the orb completely
   */
  public hideOrb() {
    if (this.orbObject) {
      this.orbObject.enabled = false;
    }
    if (this.uiParent) {
      this.uiParent.enabled = false;
    }
  }

  /**
   * Show the orb
   */
  public showOrb() {
    if (this.orbObject) {
      this.orbObject.enabled = true;
    }
    if (this.uiParent) {
      this.uiParent.enabled = true;
    }
  }
  
  /**
   * Notify the orb that AI is starting to speak
   */
  public onAIStartSpeaking() {
    this.isAudioPlaying = true;
    this.lastAudioTime = Date.now();
    this.silenceTimer = 0;
  }
  
  /**
   * Notify the orb that AI has stopped speaking
   */
  public onAIStopSpeaking() {
    this.isAudioPlaying = false;
    this.targetAudioLevel = 0;
  }
  
  /**
   * Manually set audio level for testing or external control
   */
  public setAudioLevel(level: number) {
    this.targetAudioLevel = Math.max(0, Math.min(1, level));
    this.isAudioPlaying = level > 0;
    if (this.isAudioPlaying) {
      this.lastAudioTime = Date.now();
    }
  }

  /**
   * DEBUG METHOD: Manually test orb size reduction (for debugging purposes)
   */
  public debugTestOrbSizeReduction() {
    print("[SphereController] 🧪 DEBUG: Manually testing orb size reduction");
    this.reduceOrbSizeForShoeRecommendations();
  }

  /**
   * DEBUG METHOD: Manually test orb size restoration (for debugging purposes) 
   */
  public debugTestOrbSizeRestore() {
    print("[SphereController] 🧪 DEBUG: Manually testing orb size restoration");
    this.restoreOrbSize();
  }

  /**
   * Reduce orb size by 30% (to 70% of current size) for better shoe placement visibility
   * This is called when shoe recommendations are being shown
   */
  public reduceOrbSizeForShoeRecommendations() {
    print(`[SphereController] 🔴 REDUCING orb size by 30% for shoe recommendations`);
    print(`[SphereController] 🔍 Call stack info: Called at ${new Date().toLocaleTimeString()}`);
    print(`[SphereController] Current state - trackedToHand: ${this.trackedToHand}, isOrbSizeReduced: ${this.isOrbSizeReduced}`);
    
    // Set the reduced state flag
    this.isOrbSizeReduced = true;
    
    // Switch to screen space text for better readability when reduced
    if (!this.trackedToHand) {
      print("[SphereController] 📱 Switching to screen space text for reduced orb");
      this.syncTextDisplays(); // Ensure text content is synced
      this.screenSpaceText.enabled = true;
      this.worldSpaceText.enabled = false;
    }
    
    if (this.orbObject) {
      // Apply the reduced size immediately
      const targetSize = this.trackedToHand ? this.minimizedSize : this.reducedSize;
      print(`[SphereController] 🎯 Applying target size: ${targetSize}`);
      
      // Smoothly tween to the reduced size
      LSTween.scaleToLocal(
        this.orbObject.getTransform(),
        targetSize,
        800 // Slightly longer duration for smooth transition
      )
        .easing(Easing.Quadratic.InOut)
        .onComplete(() => {
          print("[SphereController] ✅ Orb size REDUCTION animation COMPLETE");
        })
        .start();
    }

    // Also reduce close button if it's visible (when orb is expanded)
    if (!this.trackedToHand && this.closeObj) {
      const closeButtonSize = this.reducedSize.uniformScale(1.0);
      print(`[SphereController] 🎯 Reducing close button to: ${closeButtonSize}`);
      LSTween.scaleToLocal(
        this.closeObj.getTransform(),
        closeButtonSize,
        800
      )
        .easing(Easing.Quadratic.InOut)
        .start();
    }
  }  /**
   * Restore orb to full size (reverses the size reduction)
   * This can be called when shoe recommendations are no longer being shown
   */
  public restoreOrbSize() {
    print("[SphereController] 🟢 RESTORING orb to full size");
    print(`[SphereController] 🔍 Call stack info: Called at ${new Date().toLocaleTimeString()}`);
    print("[SphereController] ⚠️  WARNING: This will make orb larger - should only be called when resetting experience");
    
    // Clear the reduced state flag
    this.isOrbSizeReduced = false;
    
    // Switch back to world space text when restored
    if (!this.trackedToHand) {
      print("[SphereController] 🌍 Switching back to world space text for normal orb");
      this.syncTextDisplays(); // Ensure text content is synced
      this.screenSpaceText.enabled = false;
      this.worldSpaceText.enabled = true;
    }
    
    if (this.orbObject) {
      // Determine target size based on current state
      const targetSize = this.trackedToHand ? this.minimizedSize : this.fullSize;
      print(`[SphereController] 🎯 Restoring to target size: ${targetSize}`);
      
      // Smoothly tween to the appropriate size
      LSTween.scaleToLocal(
        this.orbObject.getTransform(),
        targetSize,
        800
      )
        .easing(Easing.Quadratic.InOut)
        .onComplete(() => {
          print("[SphereController] ✅ Orb size RESTORATION animation COMPLETE");
        })
        .start();
    }

    // Also restore close button if it's visible
    if (!this.trackedToHand && this.closeObj) {
      LSTween.scaleToLocal(
        this.closeObj.getTransform(),
        vec3.one(),
        800
      )
        .easing(Easing.Quadratic.InOut)
        .start();
    }
  }
}
