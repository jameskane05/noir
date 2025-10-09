# WebXR Camera Animation Importer for Blender

A Blender 4.2+ addon that imports WebXR camera animation JSON files (recorded with Quest headset) and converts them to editable keyframe animations for GLTF export.

## Features

- **Import WebXR JSON** - Load camera animations recorded in your Quest headset
- **Keyframe Conversion** - Converts time-based pose data to Blender keyframes
- **Coordinate System Conversion** - Automatic conversion from WebXR Y-up to Blender Z-up
- **Local-Space Deltas** - Apply animations as relative motion (delta mode)
- **Editable Animations** - Full access to F-Curves, keyframes, and Blender animation tools
- **GLTF Export Ready** - Baked keyframes work seamlessly with GLTF export

## Installation

### Method 1: Direct Install (Recommended)

1. Open Blender 4.2 or later
2. Go to `Edit > Preferences > Add-ons`
3. Click `Install...`
4. Navigate to `camera_animation_importer.py`
5. Click `Install Add-on`
6. Enable the addon by checking the box next to "Import-Export: WebXR Camera Animation Importer"

### Method 2: Manual Install

1. Copy `camera_animation_importer.py` to your Blender scripts folder:
   - **Windows**: `%APPDATA%\Blender Foundation\Blender\4.2\scripts\addons\`
   - **macOS**: `~/Library/Application Support/Blender/4.2/scripts/addons/`
   - **Linux**: `~/.config/blender/4.2/scripts/addons/`
2. Restart Blender
3. Enable in `Edit > Preferences > Add-ons`

## Usage

### Basic Import

1. Record camera animation using your WebXR tool (`index-webxr.html`)
2. Download the JSON file (e.g., `ar-head-recording-2025-01-09.json`)
3. In Blender: `File > Import > WebXR Camera Animation (.json)`
4. Select your JSON file
5. Click `Import WebXR Camera Animation`

### Import Options

#### **Create New Camera** (default: ON)

- Creates a new camera object for the animation
- Automatically sets as active scene camera

#### **Use Active Camera** (default: OFF)

- Applies animation to currently active camera
- Useful for updating existing camera animations

#### **Scale Factor** (default: 1.0)

- Scales position data
- WebXR uses meters; adjust for your scene scale
- Example: Use `0.01` if your scene uses centimeters

#### **Coordinate System**

- **Blender (Z-up)** (default) - Converts WebXR Y-up to Blender Z-up
- **WebXR (Y-up)** - Keeps original WebXR coordinate system

#### **Apply as Deltas** (default: OFF)

- **OFF**: Uses absolute positions from recording
- **ON**: Applies motion relative to camera's starting position
  - Useful for reusing animations in different locations
  - Records become "animation clips" you can offset

#### **Frame Rate** (default: 30 fps)

- Target frame rate for keyframe conversion
- Higher values = more keyframes, smoother motion
- Lower values = fewer keyframes, easier editing

## Workflow Examples

### Example 1: Import for Editing

```
1. Import with default settings
2. Edit keyframes in Dope Sheet or Graph Editor
3. Refine timing, add easing
4. Export as GLTF with animations
```

### Example 2: Reusable Animation Clip

```
1. Import with "Apply as Deltas" enabled
2. Position camera at desired start location
3. Animation plays relative to that position
4. Duplicate camera for multiple uses
```

### Example 3: Match Game Scale

```
1. Set Scale Factor to match your game (e.g., 0.1 for 1/10 scale)
2. Import animation
3. Export to GLTF
4. Load in your game at correct scale
```

## Exporting to GLTF

1. Select your camera (and any other objects)
2. `File > Export > glTF 2.0 (.gltf/.glb)`
3. In export options:
   - Check `Animation` under "Include"
   - Set `Animation > Sampling Rate` to match import frame rate
   - Choose format (`.glb` for single file, `.gltf` for separate files)
4. Export

Your camera animation is now ready to use in Three.js, Babylon.js, or other WebGL engines!

## JSON Format

The addon expects this JSON structure:

```json
{
  "version": 1,
  "referenceSpaceType": "local-floor",
  "coordinateSystem": "WebXR_right-handed_meters",
  "frames": [
    {
      "t": 0.0,
      "p": [x, y, z],
      "q": [x, y, z, w]
    },
    ...
  ]
}
```

- `t` - Time in seconds
- `p` - Position [x, y, z] in meters (optional)
- `q` - Quaternion rotation [x, y, z, w]

## Tips

### Smooth Motion

- Use Bezier interpolation (default)
- Adjust handles in Graph Editor for custom easing
- Add extra keyframes for complex motion

### Performance

- Reduce keyframes: `Graph Editor > Key > Decimate (Ratio)`
- Simplify curves: `Graph Editor > Key > Clean Keyframes`
- Balance quality vs file size

### Debugging

- Check custom properties on camera object for metadata
- Use `Timeline` to scrub through animation
- View F-Curves in Graph Editor for timing issues

## Troubleshooting

### Camera moves incorrectly

- Try toggling "Apply as Deltas"
- Check coordinate system setting (Blender vs WebXR)
- Verify scale factor matches your scene

### Animation is choppy

- Increase Frame Rate on import
- Check interpolation is set to 'BEZIER'
- Ensure you have enough keyframes

### GLTF export has no animation

- Ensure camera is selected before export
- Check "Animation" is enabled in GLTF export options
- Verify action is assigned to camera in Dope Sheet

## Requirements

- Blender 4.2 or later
- Python 3.11+ (bundled with Blender)

## License

MIT License - Free to use and modify

## Support

For issues or feature requests, contact the author or check the project repository.
