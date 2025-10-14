import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";
import { GeminiAssistant } from "./GeminiAssistantSimple";
import { SphereController } from "./SphereController";
import { LSTween } from "LSTween.lspkg/LSTween";
import Easing from "LSTween.lspkg/TweenJS/Easing";

@component
export class AIAssistantUIBridge extends BaseScriptComponent {
  @ui.separator
  @ui.label("Connects the AI Assistant to the Sphere Controller UI")
  @ui.separator
  @ui.group_start("Assistants")
  @ui.label(
    "Customize the voice and behavior of the assistant on the Gemini component."
  )
  @input
  private geminiAssistant: GeminiAssistant;
  @ui.group_end
  @ui.separator
  @ui.group_start("UI Elements")
  @input
  private sphereController: SphereController;

  @input
  private hintTitle: Text;

  @input
  private hintText: Text;
  @ui.group_end
  private textIsVisible: boolean = true;
  private currentAssistant: GeminiAssistant;

  onAwake() {
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
  }

  private onStart() {
    // Auto-start the experience immediately when lens loads
    this.hintTitle.text = "Travel Assistant";
    this.startWebsocketAndUI();
  }

  /**
   * Auto-start with Gemini (called by StateManager to skip manual button selection)
   */
  public startWebsocketAndUIWithGemini() {
    print("[AIAssistantUIBridge] Auto-starting with Gemini");
    this.hintTitle.text = "Travel Assistant";
    this.startWebsocketAndUI();
  }

  private startWebsocketAndUI() {
    this.hintText.text = "Pinch on the orb next to your left hand to activate";
    if (global.deviceInfoSystem.isEditor()) {
      this.hintText.text = "Look down and click on the orb to activate";
    }
    this.sphereController.initializeUI();
    
    // Set the current assistant to Gemini
    this.currentAssistant = this.geminiAssistant;
    
    // Create Gemini Live session
    this.geminiAssistant.createGeminiLiveSession();

    // Connect the assistant to the UI
    this.connectAssistantEvents();

    // Connect sphere controller activation to the current assistant
    this.sphereController.isActivatedEvent.add((isActivated) => {
      if (this.textIsVisible) {
        LSTween.textAlphaTo(this.hintTitle, 0, 600).start();
        LSTween.textAlphaTo(this.hintText, 0, 600).start();
        let bgColor = this.hintTitle.backgroundSettings.fill.color;
        LSTween.rawTween(600)
          .onUpdate((tweenData) => {
            let percent = tweenData.t as number;
            bgColor.a = 1 - percent;
            this.hintTitle.backgroundSettings.fill.color = bgColor;
          })
          .start();
      }
      this.textIsVisible = false;
      this.currentAssistant.streamData(isActivated);
      if (!isActivated) {
        this.currentAssistant.interruptAudioOutput();
      }
    });
  }

  private connectAssistantEvents() {
    // Connect text update events
    this.currentAssistant.updateTextEvent.add((data) => {
      this.sphereController.setText(data);
    });

    // Note: Snap3D (3D generation) functionality has been removed
    // Only standard function calls from the assistant will be processed
    this.currentAssistant.functionCallEvent.add((data) => {
      // Log that a function was called but don't process 3D generation
      print(`[AIAssistantUIBridge] Function call received: ${data.name} - 3D generation disabled`);
    });
  }
}
