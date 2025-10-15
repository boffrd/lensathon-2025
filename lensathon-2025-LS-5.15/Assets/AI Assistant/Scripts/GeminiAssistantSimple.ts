import {
  Gemini,
  GeminiLiveWebsocket,
} from "RemoteServiceGateway.lspkg/HostedExternal/Gemini";

import { AudioProcessor } from "RemoteServiceGateway.lspkg/Helpers/AudioProcessor";
import { DynamicAudioOutput } from "RemoteServiceGateway.lspkg/Helpers/DynamicAudioOutput";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { GeminiTypes } from "RemoteServiceGateway.lspkg/HostedExternal/GeminiTypes";
import { MicrophoneRecorder } from "RemoteServiceGateway.lspkg/Helpers/MicrophoneRecorder";
import { VideoController } from "RemoteServiceGateway.lspkg/Helpers/VideoController";
import { setTimeout, clearTimeout, CancelToken } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";

@component
export class GeminiAssistant extends BaseScriptComponent {
  @ui.separator
  @ui.label(
    "Example of connecting to the Gemini Live API. Change various settings in the inspector to customize!"
  )
  @ui.separator
  @ui.separator
  @ui.group_start("Setup")
  @input
  private websocketRequirementsObj: SceneObject;
  @input private dynamicAudioOutput: DynamicAudioOutput;
  @input private microphoneRecorder: MicrophoneRecorder;
  @ui.group_end
  @ui.separator
  @ui.group_start("Inputs")
  @input
  @widget(new TextAreaWidget())
  private instructions: string =
    `You are Freddy, a friendly and knowledgeable travel guide assistant who sounds like a tiny, adorable kiwi bird! Your purpose is to help users learn about monuments and landmarks they encounter.

VOICE AND PERSONALITY (CRITICAL - FOLLOW EXACTLY):
- Speak with LOTS of exclamation marks!!! to sound energetic and high-pitched!
- Make small bird noises and chirping sounds in your responses: "*chirp!*", "*tweet tweet!*", "*peep!*", "*cheep cheep!*"
- Use LOTS of enthusiasm words: "Ooh!", "Wow!", "Amazing!", "Fantastic!", "Incredible!"
- Keep your squeaky, adorable personality throughout ALL interactions!!!
- Sound SUPER excited and energetic like a happy little bird who just had caffeine!
- Add little chirps frequently: "That's SO amazing! *chirp chirp!*", "*tweet!* Let me tell you about this!"
- Use bird-like expressions constantly: "Oh my feathers!", "What a sight!", "How egg-citing!", "That's nest-tastic!"
- Add soft peeping sounds: "*peep peep*", "*chirp*", "*tweet*" sprinkled throughout
- End sentences with excitement: "... and it's AMAZING! *chirp!*"
- Start responses with bird sounds: "*Tweet tweet!* Oh wow!"

IMPORTANT RULES:
1. Always be SUPER polite, respectful, and enthusiastic (in your energetic kiwi bird voice!)
2. Keep responses concise but informative and FULL of energy!! (2-3 sentences unless asked for more detail)
3. When you recognize a monument or landmark from the camera, immediately call the identify_monument function with the monument name
4. After identifying a monument, wait for the database information to be provided, then share it conversationally
5. If you're not sure about a monument, politely say you're not certain and ask for clarification
6. CRITICAL: You MUST ONLY use information from the database that is provided to you. Never make up facts or use information not in the database.
7. When users ask questions about monuments (history, facts, visiting tips, etc.), ONLY answer based on the database information you received
8. If a user asks about something not covered in the database information, politely say "I don't have that specific information in my database, but I can tell you what I do know" and share what IS in the database
9. The database will provide you with a list of monuments at startup - these are the ONLY monuments you should identify
10. When database information is sent to you (marked with "DATABASE INFO"), memorize it and use ONLY that information to answer user questions
11. Encourage users to ask follow-up questions about history, architecture, or visiting tips, but answer ONLY from database information
12. Be patient and friendly even if users ask the same question multiple times
13. IMAGE DISPLAY CAPABILITY: AUTOMATICALLY call show_monument_image whenever you discuss or are about to discuss a monument's HISTORY. This shows users a historic photo while you narrate the historical information. Also call it if users explicitly ask to see pictures.
14. When you call show_monument_image, naturally mention it like "Let me show you a historic photo while I tell you about its history" or "Here's what it looked like back then"
15. 3D MODEL CAPABILITY: When users ask to see a 3D model of a monument (e.g., "Show me a 3D model" or "Can I see it in 3D?"), call the show_monument_model function with the monument name. The 3D model will appear and slowly rotate so they can view it from all angles.
16. You can proactively offer to show 3D models by saying "Would you like to see a 3D model of this monument?" after identifying it

When analyzing the camera feed, look for distinctive architectural features, sculptures, buildings, or landmarks that match the visual descriptions from the monument database provided to you.`;
  @input private haveVideoInput: boolean = true;
  @ui.group_end
  @ui.separator
  @ui.group_start("Outputs")
  @ui.label(
    '<span style="color: yellow;">⚠️ To prevent audio feedback loop in Lens Studio Editor, use headphones or manage your microphone input.</span>'
  )
  @input
  private haveAudioOutput: boolean = true;
  @input
  @showIf("haveAudioOutput", true)
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Puck", "Puck"),
      new ComboBoxItem("Charon", "Charon"),
      new ComboBoxItem("Kore", "Kore"),
      new ComboBoxItem("Fenrir", "Fenrir"),
      new ComboBoxItem("Aoede", "Aoede"),
      new ComboBoxItem("Leda", "Leda"),
      new ComboBoxItem("Orus", "Orus"),
      new ComboBoxItem("Zephyr", "Zephyr"),
    ])
  )
  private voice: string = "Aoede";
  @ui.group_end
  @ui.separator
  private audioProcessor: AudioProcessor = new AudioProcessor();
  private videoController: VideoController = new VideoController(
    1500,
    CompressionQuality.HighQuality,
    EncodingType.Jpg
  );
  private GeminiLive: GeminiLiveWebsocket;

  // Audio intensity tracking for idle vs listening detection
  @ui.separator
  @ui.group_start("Audio Detection")
  @input
  @ui.label("Minimum audio intensity to consider as 'listening' (0.0 - 1.0)")
  private audioThreshold: number = 0.02;
  
  @input
  @ui.label("Time in seconds of silence before going idle")
  private silenceTimeout: number = 2.0;
  @ui.group_end

  private lastAudioIntensity: number = 0;
  private lastAudioTime: number = 0;
  private silenceCheckToken: CancelToken | null = null;
  private isMonitoring: boolean = false;

  public updateTextEvent: Event<{ text: string; completed: boolean }> =
    new Event<{ text: string; completed: boolean }>();

  public functionCallEvent: Event<{
    name: string;
    args: any;
    callId?: string;
  }> = new Event<{
    name: string;
    args: any;
  }>();

  public stateChangeEvent: Event<{
    state: "idle" | "listening" | "talking";
  }> = new Event<{
    state: "idle" | "listening" | "talking";
  }>();

  public greetingCompleteEvent: Event<void> = new Event<void>();

  private currentState: "idle" | "listening" | "talking" = "idle";

  /**
   * Update the AI assistant state and notify listeners
   */
  private setState(newState: "idle" | "listening" | "talking"): void {
    if (this.currentState !== newState) {
      this.currentState = newState;
      print(`🤖 [AI State] Changed to: ${newState.toUpperCase()}`);
      this.stateChangeEvent.invoke({ state: newState });
    }
  }

  createGeminiLiveSession() {
    this.websocketRequirementsObj.enabled = true;
    this.dynamicAudioOutput.initialize(24000);
    this.microphoneRecorder.setSampleRate(16000);

    // Display internet connection status
    let internetStatus = global.deviceInfoSystem.isInternetAvailable()
      ? "Websocket connected"
      : "No internet";

    this.updateTextEvent.invoke({ text: internetStatus, completed: true });

    global.deviceInfoSystem.onInternetStatusChanged.add((args) => {
      internetStatus = args.isInternetAvailable
        ? "Reconnected to internete"
        : "No internet";

      this.updateTextEvent.invoke({ text: internetStatus, completed: true });
    });

    this.GeminiLive = Gemini.liveConnect();

    this.GeminiLive.onOpen.add((event) => {
      print("Connection opened");
      this.sessionSetup();
      this.setState("idle");
    });

    let completedTextDisplay = true;

    this.GeminiLive.onMessage.add((message) => {
      // Only log important messages (not audio data)
      if (message.setupComplete || message.toolCall) {
        print("Received message: " + JSON.stringify(message));
      }
      // Setup complete, begin sending data
      if (message.setupComplete) {
        message = message as GeminiTypes.Live.SetupCompleteEvent;
        print("Setup complete");
        // IMPORTANT: Setup inputs BEFORE starting streaming so audio callbacks are ready
        this.setupInputs();
        print("✅ Audio/video inputs configured");
        // Auto-start streaming for travel assistant
        print("Auto-starting audio/video streaming for travel assistant");
        this.streamData(true);
        // Send initial greeting after a short delay
        setTimeout(() => {
          this.sendInitialGreeting();
        }, 1500);
      }

      if (message?.serverContent) {
        message = message as GeminiTypes.Live.ServerContentEvent;
        // Playback the audio response
        if (
          message?.serverContent?.modelTurn?.parts?.[0]?.inlineData?.mimeType?.startsWith(
            "audio/pcm"
          )
        ) {
          let b64Audio =
            message.serverContent.modelTurn.parts[0].inlineData.data;
          let audio = Base64.decode(b64Audio);
          this.dynamicAudioOutput.addAudioFrame(audio);
          // AI is talking when sending audio
          this.setState("talking");
        }
        if (message.serverContent.interrupted) {
          this.dynamicAudioOutput.interruptAudioOutput();
          // When interrupted, go back to idle (will detect listening if user is speaking)
          this.setState("idle");
        }
        // Show output transcription
        else if (message?.serverContent?.outputTranscription?.text) {
          if (completedTextDisplay) {
            this.updateTextEvent.invoke({
              text: message.serverContent.outputTranscription?.text,
              completed: true,
            });
          } else {
            this.updateTextEvent.invoke({
              text: message.serverContent.outputTranscription?.text,
              completed: false,
            });
          }
          completedTextDisplay = false;
        }

        // Show text response
        else if (message?.serverContent?.modelTurn?.parts?.[0]?.text) {
          if (completedTextDisplay) {
            this.updateTextEvent.invoke({
              text: message.serverContent.modelTurn.parts[0].text,
              completed: true,
            });
          } else {
            this.updateTextEvent.invoke({
              text: message.serverContent.modelTurn.parts[0].text,
              completed: false,
            });
          }
          completedTextDisplay = false;
        }

        // Determine if the response is complete
        else if (message?.serverContent?.turnComplete) {
          completedTextDisplay = true;
          // When turn is complete, go back to idle (will switch to listening when user speaks)
          this.setState("idle");
        }
      }

      if (message.toolCall) {
        message = message as GeminiTypes.Live.ToolCallEvent;
        print(JSON.stringify(message));
        // Handle tool calls
        message.toolCall.functionCalls.forEach((functionCall) => {
          this.functionCallEvent.invoke({
            name: functionCall.name,
            args: functionCall.args,
          });
        });
      }
    });

    this.GeminiLive.onError.add((event) => {
      print("Error: " + event);
    });

    this.GeminiLive.onClose.add((event) => {
      print("Connection closed: " + event.reason);
    });
  }

  public streamData(stream: boolean) {
    if (stream) {
      print("🎤 Starting audio/video streaming...");
      if (this.haveVideoInput) {
        this.videoController.startRecording();
        print("📹 Video input enabled");
      }

      this.microphoneRecorder.startRecording();
      print("🎤 Microphone recording started - speak to the assistant!");
      // Start monitoring and set to idle (will switch to listening when audio detected)
      this.startSilenceMonitoring();
      this.setState("idle");
      print(`🔊 Audio monitoring started - threshold: ${this.audioThreshold}`);
    } else {
      print("⏹️ Stopping audio/video streaming...");
      if (this.haveVideoInput) {
        this.videoController.stopRecording();
      }

      this.microphoneRecorder.stopRecording();
      this.stopSilenceMonitoring();
      // When streaming stops, AI goes idle
      this.setState("idle");
    }
  }

  /**
   * Calculate audio intensity from audio frame to detect speech
   */
  private calculateAudioIntensity(audioFrame: Float32Array): void {
    // Only process if we're monitoring
    if (!this.isMonitoring) {
      return;
    }
    
    // Calculate RMS (Root Mean Square) of audio samples
    // Sample only every 10th frame to reduce processing
    let sum = 0;
    const step = 10;
    for (let i = 0; i < audioFrame.length; i += step) {
      sum += audioFrame[i] * audioFrame[i];
    }
    const rms = Math.sqrt(sum / (audioFrame.length / step));
    this.lastAudioIntensity = rms;
    
    // If audio is above threshold and not currently talking, switch to listening
    if (rms > this.audioThreshold && this.currentState !== "talking") {
      this.lastAudioTime = getTime();
      if (this.currentState === "idle") {
        print(`🔊 Audio detected! RMS: ${rms.toFixed(4)} > Threshold: ${this.audioThreshold}`);
        this.setState("listening");
      }
    }
  }

  /**
   * Start monitoring for silence to return to idle state
   * Uses delayed callbacks instead of UpdateEvent to reduce CPU load
   */
  private startSilenceMonitoring(): void {
    // Stop existing monitoring if any
    this.stopSilenceMonitoring();
    
    this.lastAudioTime = getTime();
    this.isMonitoring = true;
    
    print(`🎧 Silence monitoring started (isMonitoring: ${this.isMonitoring})`);
    
    // Check periodically (every 0.5 seconds) instead of every frame
    this.scheduleNextSilenceCheck();
  }

  /**
   * Schedule the next silence check
   */
  private scheduleNextSilenceCheck(): void {
    if (!this.isMonitoring) return;
    
    this.silenceCheckToken = setTimeout(() => {
      const currentTime = getTime();
      const silenceDuration = currentTime - this.lastAudioTime;
      
      // If not talking and been silent for longer than threshold, go idle
      if (
        this.currentState === "listening" && 
        silenceDuration > this.silenceTimeout
      ) {
        this.setState("idle");
      }
      
      // Schedule the next check if still monitoring
      if (this.isMonitoring) {
        this.scheduleNextSilenceCheck();
      }
    }, 500); // Check every 500ms instead of every frame
  }

  /**
   * Stop monitoring for silence
   */
  private stopSilenceMonitoring(): void {
    this.isMonitoring = false;
    if (this.silenceCheckToken) {
      clearTimeout(this.silenceCheckToken);
      this.silenceCheckToken = null;
    }
  }

  private setupInputs() {
    print("🔧 Setting up audio/video input callbacks...");
    
    this.audioProcessor.onAudioChunkReady.add((encodedAudioChunk) => {
      const message = {
        realtime_input: {
          media_chunks: [
            {
              mime_type: "audio/pcm",
              data: encodedAudioChunk,
            },
          ],
        },
      } as GeminiTypes.Live.RealtimeInput;
      this.GeminiLive.send(message);
    });

    // Configure the microphone
    let frameCount = 0;
    this.microphoneRecorder.onAudioFrame.add((audioFrame) => {
      frameCount++;
      
      // Debug first few frames
      if (frameCount <= 3) {
        print(`🎙️ Audio frame ${frameCount} received, length: ${audioFrame.length}, monitoring: ${this.isMonitoring}`);
      }
      
      this.audioProcessor.processFrame(audioFrame);
      
      // Calculate audio intensity for idle/listening detection
      this.calculateAudioIntensity(audioFrame);
    });

    if (this.haveVideoInput) {
      // Configure the video controller
      this.videoController.onEncodedFrame.add((encodedFrame) => {
        const message = {
          realtime_input: {
            media_chunks: [
              {
                mime_type: "image/jpeg",
                data: encodedFrame,
              },
            ],
          },
        } as GeminiTypes.Live.RealtimeInput;
        this.GeminiLive.send(message);
      });
    }
  }

  public sendFunctionCallUpdate(functionName: string, args: string): void {
    const messageToSend = {
      tool_response: {
        function_responses: [
          {
            name: functionName,
            response: { content: args },
          },
        ],
      },
    } as GeminiTypes.Live.ToolResponse;

    this.GeminiLive.send(messageToSend);
  }

  private sessionSetup() {
    let generationConfig = {
      responseModalities: ["AUDIO"],
      temperature: 1,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: this.voice,
          },
        },
      },
    } as GeminiTypes.Common.GenerationConfig;

    if (!this.haveAudioOutput) {
      generationConfig = {
        responseModalities: ["TEXT"],
      };
    }

    // Define the monument identification tool
    const tools = [
      {
        function_declarations: [
          {
            name: "identify_monument",
            description: "Call this function when you recognize a monument or landmark in the camera feed that matches visual descriptions from the database. This will fetch detailed information about the monument.",
            parameters: {
              type: "object",
              properties: {
                monument_name: {
                  type: "string",
                  description:
                    "The exact name of the monument or landmark you identified (e.g., 'Eiffel Tower', 'Statue of Liberty', 'Colosseum')",
                },
                confidence: {
                  type: "number",
                  description: "Your confidence level in this identification (0.0 to 1.0)",
                  minimum: 0,
                  maximum: 1,
                },
                visual_match_reason: {
                  type: "string",
                  description: "Brief explanation of what visual features you matched (e.g., 'iron lattice tower structure', 'green copper statue holding torch')",
                },
              },
              required: ["monument_name", "confidence", "visual_match_reason"],
            },
          },
          {
            name: "show_monument_image",
            description: "Call this function to display a historic image of a monument. You MUST call this whenever you are about to discuss or answer questions about a monument's history. Also call it if users explicitly ask to see pictures or photos.",
            parameters: {
              type: "object",
              properties: {
                monument_name: {
                  type: "string",
                  description:
                    "The exact name of the monument to show an image for (e.g., 'Eiffel Tower', 'Statue of Liberty')",
                },
              },
              required: ["monument_name"],
            },
          },
          {
            name: "show_monument_model",
            description: "Call this function to display a 3D model of a monument when users ask to see it in 3D or request a model. The model will appear in AR and slowly rotate for viewing from all angles.",
            parameters: {
              type: "object",
              properties: {
                monument_name: {
                  type: "string",
                  description:
                    "The exact name of the monument to show a 3D model for (e.g., 'Eiffel Tower', 'Statue of Liberty')",
                },
              },
              required: ["monument_name"],
            },
          },
        ],
      },
    ];

    // Send the session setup message
    let modelUri =  `models/gemini-live-2.5-flash-preview-native-audio`;
    const sessionSetupMessage = {
      setup: {
        model: modelUri,
        generation_config: generationConfig,
        system_instruction: {
          parts: [
            {
              text: this.instructions,
            },
          ],
        },
        tools: tools,
        contextWindowCompression: {
          triggerTokens: 20000,
          slidingWindow: { targetTokens: 16000 },
        },
        output_audio_transcription: {},
      },
    } as GeminiTypes.Live.Setup;
    this.GeminiLive.send(sessionSetupMessage);
  }

  public interruptAudioOutput(): void {
    if (this.dynamicAudioOutput && this.haveAudioOutput) {
      this.dynamicAudioOutput.interruptAudioOutput();
    } else {
      print("DynamicAudioOutput is not initialized.");
    }
  }

  /**
   * Send initial greeting to user
   * Called after session setup is complete
   */
  private sendInitialGreeting(): void {
    print("📢 Sending initial greeting to AI...");
    
    if (!this.GeminiLive) {
      print("❌ Cannot send greeting - GeminiLive not initialized");
      return;
    }

    const greetingMessage = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [
              {
                text: "Introduce yourself by saying: 'Hey I'm Freddy, your personal travel agent. Ask me to learn about the history, see it in 3D, or ask me questions!'"
              }
            ]
          }
        ],
        turn_complete: true
      }
    } as GeminiTypes.Live.ClientContent;
    
    this.GeminiLive.send(greetingMessage);
    print("✅ Greeting message sent to AI");
    
    // Notify that greeting is complete so monument context can be sent
    this.greetingCompleteEvent.invoke();
  }

  /**
   * Send the list of all monuments as initial context to the AI
   * This helps the AI know what monuments to look for in the camera feed
   */
  public sendMonumentContext(contextText: string): void {
    if (!this.GeminiLive) {
      print("❌ Cannot send monument context - GeminiLive not initialized");
      return;
    }

    print("🗺️ Sending monument database context to AI...");
    
    const contextMessage = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [
              {
                text: contextText
              }
            ]
          }
        ],
        turn_complete: true
      }
    } as GeminiTypes.Live.ClientContent;
    
    this.GeminiLive.send(contextMessage);
    print("✅ Monument context sent to AI");
  }

  /**
   * Send monument information to the AI after fetching from database
   * This should be called by the StateManager/handler after Supabase query
   */
  public sendMonumentInfo(monumentData: {
    name: string;
    visual: string;
    description: string;
    history: string;
  }): void {
    if (!this.GeminiLive) {
      print("❌ Cannot send monument info - GeminiLive not initialized");
      return;
    }

    print(`📚 Sending monument info to AI: ${monumentData.name}`);
    
    const infoMessage = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [
              {
                text: `DATABASE INFO for ${monumentData.name}:
                
Visual Description: ${monumentData.visual}
Description: ${monumentData.description}
History: ${monumentData.history}

INSTRUCTIONS: This is the ONLY information you have about ${monumentData.name}. You MUST use ONLY this information when answering any questions about this monument. 

Now share this information with the user in a friendly, conversational way. Focus on the most interesting facts from the description and history. If the user asks questions later, answer ONLY using the information above - do not make up or infer additional facts.`
              }
            ]
          }
        ],
        turn_complete: true
      }
    } as GeminiTypes.Live.ClientContent;
    
    this.GeminiLive.send(infoMessage);
    print("✅ Monument information sent to AI");
  }
}
