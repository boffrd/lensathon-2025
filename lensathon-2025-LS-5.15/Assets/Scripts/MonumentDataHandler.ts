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
      // Query the database for the monument
      // Using case-insensitive search with ilike
      const { data, error } = await this.client
        .from(this.tableName)
        .select("name, visual, description, history")
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
