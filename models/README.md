# Models Directory

## Required Model File

This project requires the dlib facial landmark predictor model:

**File:** `shape_predictor_68_face_landmarks.dat`

### Download Instructions

Due to GitHub file size limitations, please download the model file manually:

1. Download from dlib's official source:
   ```
   http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2
   ```

2. Extract the `.bz2` file:
   ```bash
   bzip2 -d shape_predictor_68_face_landmarks.dat.bz2
   ```

3. Place the extracted `.dat` file in this `models/` directory

The file should be approximately 95MB after extraction.
