import { SnapCloudRequirements } from '../Examples/SnapCloudRequirements';
import { createClient } from 'SupabaseClient.lspkg/supabase-snapcloud';
import { GeminiAssistant } from '../AI Assistant/Scripts/GeminiAssistantSimple';

/**
 * Handles fetching monument data from Supabase and sending it to the AI assistant
 */
@component
export class MonumentDataHandler extends BaseScriptComponent {
  @input
  @hint("Reference to SnapCloudRequirements for Supabase configuration")
  private snapCloudRequirements: SnapCloudRequirements;

  @input
  @hint("Reference to the GeminiAssistant component")
  private geminiAssistant: GeminiAssistant;

  @input
  @hint("Name of the table containing monument information")
  private tableName: string = "test_agent_info";

  @input
  @hint("Name of the Supabase Storage bucket containing monument images")
  private storageBucket: string = "monument-images";

  @input
  @hint("Image component to display loaded monument images")
  @allowUndefined
  private monumentImageDisplay: Image;

  @ui.separator
  @ui.group_start("Debug Settings")
  @input
  @ui.label("Enable detailed debug logging for database operations")
  private debugMode: boolean = true;
  
  @input
  @ui.label("Print all monument data from database on start")
  private printDbInfoOnStart: boolean = false;
  @ui.group_end

  private client: any;
  private uid: string;
  private isConnected: boolean = false;
  private internetModule: InternetModule = require('LensStudio:InternetModule');
  private remoteMediaModule: RemoteMediaModule = require('LensStudio:RemoteMediaModule');
  private storageApiUrl: string = "";

  onAwake() {
    print("[MonumentDataHandler] 🚀 Script awakened - starting initialization");
    this.createEvent("OnStartEvent").bind(() => {
      this.onStart();
    });
  }

  async onStart() {
    print("[MonumentDataHandler] 🔄 onStart called");
    
    // Check if required inputs are assigned
    if (!this.snapCloudRequirements) {
      print("[MonumentDataHandler] ❌ ERROR: SnapCloudRequirements not assigned!");
      print("[MonumentDataHandler] ℹ️  Please assign SnapCloudRequirements in the Inspector");
      return;
    }
    
    if (!this.geminiAssistant) {
      print("[MonumentDataHandler] ⚠️  WARNING: GeminiAssistant not assigned!");
      print("[MonumentDataHandler] ℹ️  Monument identification will not work without it");
    }
    
    await this.initSupabase();
    
    // Listen for monument identification function calls from the AI
    if (this.geminiAssistant) {
      this.geminiAssistant.functionCallEvent.add((data) => {
        this.handleFunctionCall(data.name, data.args);
      });
      this.log("✅ MonumentDataHandler connected to Gemini Assistant");
    }
    
    // Print database info if debug mode is enabled
    if (this.printDbInfoOnStart) {
      await this.printAllMonumentsInfo();
    }
    
    // Fetch all monuments and send as context to AI
    await this.loadMonumentsAsContext();
    
    print("[MonumentDataHandler] ✅ Initialization complete");
  }

  /**
   * Initialize Supabase connection
   */
  private async initSupabase() {
    print("[MonumentDataHandler] 📡 Initializing Supabase connection...");
    
    if (!this.snapCloudRequirements) {
      print("[MonumentDataHandler] ❌ SnapCloudRequirements is null!");
      return;
    }
    
    if (!this.snapCloudRequirements.isConfigured()) {
      print("[MonumentDataHandler] ❌ SnapCloudRequirements not configured properly");
      print("[MonumentDataHandler] ℹ️  Check that Supabase Project asset is assigned");
      return;
    }

    const supabaseProject = this.snapCloudRequirements.getSupabaseProject();
    
    if (!supabaseProject) {
      print("[MonumentDataHandler] ❌ Supabase Project is null!");
      return;
    }
    
    print(`[MonumentDataHandler] 🔑 Project URL: ${supabaseProject.url}`);
    print(`[MonumentDataHandler] 🔑 Public Token: ${supabaseProject.publicToken ? "✓ Present" : "✗ Missing"}`);
    
    // Initialize storage URL for loading images
    this.storageApiUrl = this.snapCloudRequirements.getStorageApiUrl();
    print(`[MonumentDataHandler] 🖼️  Storage API URL: ${this.storageApiUrl}`);
    
    // Configure client options with heartbeat fix for alpha
    const options = {
      realtime: {
        // Temporary fix due to a known alpha limitation
        heartbeatIntervalMs: 2500,
      },
    };
    
    this.client = createClient(supabaseProject.url, supabaseProject.publicToken, options);
    print("[MonumentDataHandler] ✅ Supabase client created");

    if (this.client) {
      await this.signInUser();
    } else {
      print("[MonumentDataHandler] ❌ Failed to create Supabase client!");
    }
  }

  /**
   * Sign in user with Snap authentication
   */
  private async signInUser() {
    print("[MonumentDataHandler] 🔐 Signing in user...");
    
    const { data, error } = await this.client.auth.signInWithIdToken({
      provider: 'snapchat',
      token: '',
    });
    
    if (error) {
      print("[MonumentDataHandler] ❌ Sign in error: " + JSON.stringify(error));
    } else {
      const { user, session } = data;
      print(`[MonumentDataHandler] 👤 User data: ${JSON.stringify(user)}`);
      // Remove quotes from user ID string
      this.uid = JSON.stringify(user.id).replace(/^"(.*)"$/, '$1');
      this.isConnected = true;
      print(`[MonumentDataHandler] ✅ Authenticated as user: ${this.uid}`);
      print(`[MonumentDataHandler] 📊 Ready to query table: ${this.tableName}`);
    }
  }

  /**
   * Print all monuments from database with full details (for debugging)
   */
  public async printAllMonumentsInfo() {
    if (!this.client || !this.isConnected) {
      print("❌ Cannot fetch data - Supabase not connected");
      return;
    }

    print("\n╔════════════════════════════════════════════════════════════");
    print("║ 📚 DATABASE CONTENTS - test_agent_info table");
    print("╚════════════════════════════════════════════════════════════\n");

    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("*");

      if (error) {
        print(`❌ Database error: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        print("⚠️  Database is empty - no monuments found");
        print("   Add monuments using SQL or the addMonument() method\n");
        return;
      }

      print(`✅ Found ${data.length} monument(s) in database:\n`);
      
      data.forEach((monument: any, index: number) => {
        print(`\n┌─ Monument ${index + 1} ───────────────────────────────────────`);
        print(`│ 🏛️  NAME: ${monument.name || "N/A"}`);
        print(`│`);
        print(`│ 👁️  VISUAL DESCRIPTION (what AI looks for):`);
        print(`│    ${this.formatText(monument.visual || "No visual description", "│    ")}`);
        print(`│`);
        print(`│ 📖 DESCRIPTION (what AI tells user):`);
        print(`│    ${this.formatText(monument.description || "No description", "│    ")}`);
        print(`│`);
        print(`│ 📜 HISTORY:`);
        print(`│    ${this.formatText(monument.history || "No history", "│    ")}`);
        print(`│`);
        print(`│ 🆔 ID: ${monument.id || "N/A"}`);
        if (monument.created_at) {
          print(`│ 📅 Created: ${monument.created_at}`);
        }
        print(`└────────────────────────────────────────────────────────────`);
      });

      print(`\n✅ Database dump complete - ${data.length} monuments displayed\n`);

    } catch (error) {
      print(`❌ Error fetching monuments: ${error}`);
    }
  }

  /**
   * Helper to format long text with line wrapping
   */
  private formatText(text: string, prefix: string = ""): string {
    if (!text) return "N/A";
    
    const maxLength = 60;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = "";

    words.forEach(word => {
      if ((currentLine + word).length > maxLength) {
        lines.push(currentLine.trim());
        currentLine = word + " ";
      } else {
        currentLine += word + " ";
      }
    });
    
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }

    return lines.join(`\n${prefix}`);
  }

  /**
   * Debug logging method - only prints if debugMode is enabled
   */
  private log(message: string): void {
    if (this.debugMode) {
      print(`[MonumentDataHandler] ${message}`);
    }
  }

  /**
   * Handle function calls from the AI
   */
  private async handleFunctionCall(functionName: string, args: any) {
    this.log(`🔧 Function call received: ${functionName}`);
    
    if (functionName === "identify_monument") {
      const monumentName = args.monument_name;
      const confidence = args.confidence;
      const visualMatchReason = args.visual_match_reason;
      
      this.log(`🏛️ AI identified monument: ${monumentName} (confidence: ${confidence})`);
      this.log(`   Visual match: ${visualMatchReason}`);
      
      // Fetch monument data from Supabase
      await this.fetchMonumentData(monumentName);
    } else if (functionName === "show_monument_image") {
      const monumentName = args.monument_name;
      
      this.log(`🖼️ AI requested to show image for: ${monumentName}`);
      
      // Fetch and display monument image
      await this.fetchAndDisplayMonumentImage(monumentName);
    }
  }

  /**
   * Fetch monument data from Supabase by name
   */
  private async fetchMonumentData(monumentName: string) {
    if (!this.client || !this.isConnected) {
      this.log("❌ Cannot fetch data - Supabase not connected");
      return;
    }

    this.log(`🔍 Fetching data for monument: ${monumentName}`);

    try {
      // Query the database for the monument (including image_url)
      // Using case-insensitive search with ilike
      const { data, error } = await this.client
        .from(this.tableName)
        .select("name, visual, description, history, image_url")
        .ilike("name", `%${monumentName}%`)
        .limit(1);

      if (error) {
        this.log(`❌ Database error: ${error.message}`);
        this.sendMonumentNotFound(monumentName);
        return;
      }

      if (!data || data.length === 0) {
        this.log(`⚠️ No monument found matching: ${monumentName}`);
        this.sendMonumentNotFound(monumentName);
        return;
      }

      // Found the monument data
      const monument = data[0];
      this.log(`✅ Monument data retrieved: ${monument.name}`);
      
      // Send the data to the AI assistant
      this.geminiAssistant.sendMonumentInfo({
        name: monument.name,
        visual: monument.visual || "No visual description available",
        description: monument.description || "No description available",
        history: monument.history || "No historical information available"
      });

    } catch (error) {
      this.log(`❌ Error fetching monument data: ${error}`);
      this.sendMonumentNotFound(monumentName);
    }
  }

  /**
   * Notify AI that monument was not found in database
   */
  private sendMonumentNotFound(monumentName: string) {
    this.log(`🔍 Monument not found in DB: ${monumentName}`);
    if (this.geminiAssistant) {
      this.geminiAssistant.sendMonumentInfo({
        name: monumentName,
        visual: "Not found in database",
        description: `I don't have specific information about ${monumentName} in my database yet. However, I can see it through the camera. Would you like me to describe what I see, or do you have any specific questions about it?`,
        history: "Information not available"
      });
    }
  }

  /**
   * Fetch monument image URL from database and display it
   */
  private async fetchAndDisplayMonumentImage(monumentName: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      this.log("❌ Cannot fetch image - Supabase not connected");
      this.sendImageFunctionResponse(monumentName, false, "Database not connected");
      return;
    }

    this.log(`🔍 Fetching image URL for monument: ${monumentName}`);

    try {
      // Query the database for the monument's image_url
      const { data, error } = await this.client
        .from(this.tableName)
        .select("name, image_url")
        .ilike("name", `%${monumentName}%`)
        .limit(1);

      if (error) {
        this.log(`❌ Database error fetching image: ${error.message}`);
        this.sendImageFunctionResponse(monumentName, false, "Database error");
        return;
      }

      if (!data || data.length === 0) {
        this.log(`⚠️ No monument found with name: ${monumentName}`);
        this.sendImageFunctionResponse(monumentName, false, "Monument not found");
        return;
      }

      const monument = data[0];
      
      if (!monument.image_url) {
        this.log(`⚠️ No image URL available for monument: ${monument.name}`);
        this.sendImageFunctionResponse(monumentName, false, "No image available");
        return;
      }

      this.log(`✅ Found image URL: ${monument.image_url}`);
      
      // Load and display the image
      await this.loadMonumentImage(monument.image_url);
      
      // Send success response to AI
      this.sendImageFunctionResponse(monumentName, true, "Historic image displayed successfully");
      
    } catch (error) {
      this.log(`❌ Exception fetching monument image: ${error}`);
      this.sendImageFunctionResponse(monumentName, false, `Error: ${error}`);
    }
  }

  /**
   * Send function response back to AI after image operation
   */
  private sendImageFunctionResponse(monumentName: string, success: boolean, message: string): void {
    if (!this.geminiAssistant) {
      return;
    }

    const response = success 
      ? `Successfully displayed historic image of ${monumentName}. ${message}`
      : `Unable to display image of ${monumentName}. ${message}`;
    
    this.log(`📤 Sending function response to AI: ${response}`);
    this.geminiAssistant.sendFunctionCallUpdate("show_monument_image", response);
  }

  /**
   * Load monument image from Supabase Storage
   */
  private async loadMonumentImage(imageFilename: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.monumentImageDisplay) {
          this.log("⚠️ No image display component configured");
          resolve();
          return;
        }

        // Check if imageFilename is already a full URL or just a filename
        let imageUrl: string;
        if (imageFilename.startsWith("http://") || imageFilename.startsWith("https://")) {
          // Already a full URL, use it directly
          imageUrl = imageFilename;
        } else {
          // Just a filename, construct full storage URL
          imageUrl = `${this.storageApiUrl}${this.storageBucket}/${imageFilename}`;
        }
        this.log(`🖼️ Loading image from: ${imageUrl}`);

        // Create resource from URL
        const resource = this.internetModule.makeResourceFromUrl(imageUrl);

        // Load as image texture
        this.remoteMediaModule.loadResourceAsImageTexture(
          resource,
          (texture: Texture) => {
            // Apply texture to image display
            this.monumentImageDisplay.mainPass.baseTex = texture;
            this.log("✅ Monument image loaded and displayed");
            resolve();
          },
          (error: string) => {
            this.log(`❌ Error loading monument image: ${error}`);
            reject(error);
          }
        );
      } catch (error) {
        this.log(`❌ Exception loading monument image: ${error}`);
        reject(error);
      }
    });
  }

  /**
   * Load all monuments from database and send to AI as initial context
   * This helps the AI know what monuments to look for
   */
  private async loadMonumentsAsContext() {
    if (!this.client || !this.isConnected) {
      this.log("❌ Cannot fetch monuments - Supabase not connected");
      return;
    }

    if (!this.geminiAssistant) {
      this.log("⚠️ Cannot send context - GeminiAssistant not assigned");
      return;
    }

    this.log("🔍 Loading all monuments from database as AI context...");

    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("id, name, visual");

      if (error) {
        this.log(`❌ Database error: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        this.log("⚠️ No monuments in database - AI will not have context");
        return;
      }

      this.log(`✅ Found ${data.length} monuments in database`);
      
      // Format the monument list for AI context
      let contextText = `MONUMENT DATABASE - You can identify these ${data.length} monuments:\n\n`;
      
      data.forEach((monument: any, index: number) => {
        contextText += `${index + 1}. ${monument.name} (ID: ${monument.id})\n`;
        contextText += `   Visual: ${monument.visual}\n\n`;
      });
      
      contextText += `When you see any of these monuments in the camera feed, call the identify_monument function with the exact monument name.`;
      
      // Send context to AI
      this.geminiAssistant.sendMonumentContext(contextText);
      this.log(`✅ Sent ${data.length} monuments as context to AI`);

    } catch (error) {
      this.log(`❌ Error loading monuments: ${error}`);
    }
  }

  /**
   * Public method to manually fetch all monuments (for testing)
   */
  public async fetchAllMonuments() {
    if (!this.client || !this.isConnected) {
      this.log("❌ Cannot fetch data - Supabase not connected");
      return;
    }

    this.log("🔍 Fetching all monuments from database...");

    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("name, visual")
        .limit(10);

      if (error) {
        this.log(`❌ Database error: ${error.message}`);
        return;
      }

      this.log(`✅ Found ${data.length} monuments in database:`);
      data.forEach((monument: any, index: number) => {
        this.log(`  ${index + 1}. ${monument.name}`);
        this.log(`     Visual: ${monument.visual?.substring(0, 60)}...`);
      });

    } catch (error) {
      this.log(`❌ Error fetching monuments: ${error}`);
    }
  }

  /**
   * Public method to add a new monument to the database
   */
  public async addMonument(name: string, visual: string, description: string, history: string) {
    if (!this.client || !this.isConnected) {
      this.log("❌ Cannot add monument - Supabase not connected");
      return false;
    }

    this.log(`📝 Adding monument to database: ${name}`);

    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .insert({
          name: name,
          visual: visual,
          description: description,
          history: history,
          created_at: new Date().toISOString()
        })
        .select();

      if (error) {
        this.log(`❌ Failed to add monument: ${error.message}`);
        return false;
      }

      this.log(`✅ Monument added successfully: ${name}`);
      return true;

    } catch (error) {
      this.log(`❌ Error adding monument: ${error}`);
      return false;
    }
  }
}
