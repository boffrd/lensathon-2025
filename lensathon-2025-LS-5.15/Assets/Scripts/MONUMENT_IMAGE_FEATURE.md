# Monument Image Display Feature

This feature allows the AR travel guide to display historic images of monuments from Supabase Storage when they are identified or when users ask about them.

## Architecture Overview

```
User asks about monument
       ↓
AI identifies monument (identify_monument function)
       ↓
MonumentDataHandler.fetchMonumentData()
       ↓
Query database (includes image_url)
       ↓
MonumentDataHandler.loadMonumentImage()
       ↓
Supabase Storage → Remote Media Module → Image Texture
       ↓
Display on Image component
```

## Setup Steps

### 1. Database Migration

Run the SQL migration to add the `image_url` column:

```sql
ALTER TABLE test_agent_info 
ADD COLUMN IF NOT EXISTS image_url TEXT;
```

Location: `/Assets/Scripts/database_migrations/add_image_url_column.sql`

### 2. Create Storage Bucket

In your Supabase dashboard:
1. Go to Storage
2. Create a new bucket: `monument-images`
3. Set bucket to **public** (or configure appropriate policies)
4. Upload your monument images

### 3. Upload Images

Upload historic monument images to the bucket with descriptive filenames:
- `eiffel-tower-historic.jpg`
- `statue-of-liberty-historic.jpg`
- `big-ben-historic.jpg`

**Recommended Image Specs:**
- Format: JPG or PNG
- Max size: 2MB (for fast loading)
- Resolution: 1024x1024 or similar
- Aspect ratio: Square or 4:3 recommended

### 4. Update Database Records

Add image filenames to your monument records:

```sql
UPDATE test_agent_info 
SET image_url = 'eiffel-tower-historic.jpg' 
WHERE name = 'Eiffel Tower';

UPDATE test_agent_info 
SET image_url = 'statue-of-liberty-historic.jpg' 
WHERE name = 'Statue of Liberty';

UPDATE test_agent_info 
SET image_url = 'big-ben-historic.jpg' 
WHERE name = 'Big Ben';
```

### 5. Configure Lens Studio Scene

In Lens Studio:
1. Select the `MonumentDataHandler` script object
2. Set **Storage Bucket**: `monument-images`
3. Assign an **Image** component to **Monument Image Display** field
4. Make sure the Image component has a visible material

## Code Components

### MonumentDataHandler.ts Updates

**New Inputs:**
```typescript
@input storageBucket: string = "monument-images"
@input monumentImageDisplay: Image
```

**New Properties:**
```typescript
private internetModule: InternetModule
private remoteMediaModule: RemoteMediaModule
private storageApiUrl: string
```

**New Method:**
```typescript
loadMonumentImage(imageFilename: string): Promise<void>
```

**Updated Query:**
```typescript
.select("name, visual, description, history, image_url")
```

### Image Loading Flow

1. **Storage URL Construction:**
   ```typescript
   const imageUrl = `${this.storageApiUrl}${this.storageBucket}/${imageFilename}`;
   ```

2. **Resource Creation:**
   ```typescript
   const resource = this.internetModule.makeResourceFromUrl(imageUrl);
   ```

3. **Texture Loading:**
   ```typescript
   this.remoteMediaModule.loadResourceAsImageTexture(
     resource,
     (texture) => { this.monumentImageDisplay.mainPass.baseTex = texture; },
     (error) => { print(`Error: ${error}`); }
   );
   ```

## Usage Examples

### Scenario 1: User Points at Eiffel Tower
```
User: "What am I looking at?"
AI identifies → Monument: "Eiffel Tower"
→ Database query returns image_url: "eiffel-tower-historic.jpg"
→ Image loads from Storage
→ Display shows historic photo
→ AI responds with description
```

### Scenario 2: User Asks for History
```
User: "Tell me about the Statue of Liberty's history"
AI calls identify_monument("Statue of Liberty")
→ Loads image: "statue-of-liberty-historic.jpg"
→ Shows historic photo while narrating history
```

## Error Handling

The system gracefully handles missing or failed images:

- **No Image Component:** Logs warning, continues without image
- **Missing image_url:** Logs info, monument info displayed without image
- **Failed Image Load:** Logs error, monument info still provided by AI
- **Network Error:** Error callback triggered, operation continues

## Debug Logging

Enable `debugMode` in MonumentDataHandler to see:

```
🖼️ Loading image from: https://...monument-images/eiffel-tower-historic.jpg
✅ Monument image loaded and displayed
```

Or errors:
```
⚠️ No image display component configured
❌ Error loading monument image: Network timeout
```

## Storage URL Format

The storage URL is automatically constructed:
```
{storageApiUrl} + {bucket} + "/" + {filename}
```

Example:
```
https://fvdxtktlgvnuydvjuxlo.snapcloud.dev/storage/v1/object/public/monument-images/eiffel-tower-historic.jpg
```

## Future Enhancements

Potential improvements:
- [ ] Multiple images per monument (gallery)
- [ ] Image transitions/animations
- [ ] Fallback to default placeholder image
- [ ] Image preloading on startup
- [ ] Progress indicator during load
- [ ] Image metadata (caption, date, photographer)
- [ ] User-uploaded images to custom monuments

## Troubleshooting

**Image Not Displaying:**
1. Check bucket name matches: `monument-images`
2. Verify bucket is public or has correct policies
3. Confirm image filename in database matches actual file
4. Check Image component is assigned in Inspector
5. Enable debug mode and check logs for errors

**Image Loads Slowly:**
- Reduce image file size
- Use optimized JPG format
- Check network connection quality

**Database Error:**
- Ensure `image_url` column exists
- Check column is TEXT type (not URL or other)
- Verify table permissions allow SELECT on new column

## Technical References

- **StorageLoader.ts:** `/Assets/Examples/Example3-LoadAssets/StorageLoader.ts`
- **InternetModule API:** Lens Studio documentation
- **RemoteMediaModule API:** Lens Studio documentation
- **Supabase Storage:** https://supabase.com/docs/guides/storage
