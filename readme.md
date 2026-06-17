# Drowsiness Detection: Python & AI Web Dashboard 😴 🚫 🚗

[![License](https://img.shields.io/github/license/sourcerer-io/hall-of-fame.svg?colorB=ff0000)](https://github.com/akshaybahadur21/Drowsiness_Detection/blob/master/LICENSE.txt)
[![Author](https://img.shields.io/badge/Akshay-Bahadur-brightgreen.svg?colorB=ff0000)](https://akshaybahadur.com)
[![Vercel Deployment](https://img.shields.io/badge/deploy-Vercel-black.svg?logo=vercel)](https://vercel.com)

A computer vision safety system that automatically monitors eye blink patterns and alerts when driver fatigue/drowsiness is detected.

Now updated with a **premium, serverless-friendly AI Web Dashboard** ready for instant Vercel deployment!

---

## 🌟 Web Application Dashboard (Vercel Ready)

The web dashboard is written in HTML, CSS, and JavaScript. It runs fully client-side using **MediaPipe Face Landmarker (WASM)** and synthesizes alarm audio using the **Web Audio API**.

### Features
- **0% Server Overhead**: Detection runs locally in the browser at 60 FPS.
- **Dynamic Face Overlays**: Draws real-time eye mesh outlines and silhouette indicators.
- **Calibration Panel**: Customize the Eye Aspect Ratio (EAR) threshold, consecutive frame delay, and alarm volume.
- **Web Audio Synth**: 3 distinct alarm modes (Pulse Beep, Wailing Siren, Sci-Fi Alert) with no external audio file dependencies.
- **Session Analytics**: Live counter for blinks, total warnings, and session duration.
- **Real-Time EAR Graph**: High-performance canvas chart plotting eye state history.

### Running Locally
To test the web interface locally, serve the directory from a web server (needed for camera access permissions and ES modules):

Using python:
```bash
python3 -m http.server 8000
```
Or using Node's `serve` package:
```bash
npx serve
```
Then navigate to `http://localhost:8000` (or `http://localhost:3000`) in your browser.

### Deploying to Vercel
This project is configured as a static site and can be deployed directly to Vercel:
1. Push this workspace to your GitHub/GitLab repository.
2. Go to [Vercel](https://vercel.com), click **Add New Project**, and select this repository.
3. Keep default settings (Vercel will detect it as a static site).
4. Click **Deploy**!

---

## 🐉 Legacy Python Application

If you prefer to run the computer vision system locally as a Python script, you can execute the legacy desktop window version.

### Code Requirements
- Python version 3.6 or higher.

### Dependencies
Install the required packages using pip:
```bash
pip install opencv-python imutils dlib scipy
```
*Note: Make sure to download and place `shape_predictor_68_face_landmarks.dat` inside the `models/` directory.*

### Running the Python Script
Run the script to launch the webcam window:
```bash
python Drowsiness_Detection.py
```
Press `q` on your keyboard to close the window and exit.

---

## 👨‍🔬 Core Algorithm (Eye Aspect Ratio)

Both applications calculate the **Eye Aspect Ratio (EAR)** using 6 facial landmarks mapping to the structure of each eye.

$$\text{EAR} = \frac{\lVert p_2 - p_6 \rVert + \lVert p_3 - p_5 \rVert}{2 \times \lVert p_1 - p_4 \rVert}$$

- When the eyes are open, the EAR stays constant (typically between `0.25` and `0.35`).
- When the eyes close, the EAR drops close to zero.
- If the average EAR of both eyes stays below the threshold (default: `0.25`) for a consecutive number of frames (default: `20` frames, which is ~0.7 seconds), a drowsiness warning is triggered.

---

## 📌 Cite Us

To cite this project, please use the following format:
```bibtex
@article{Drowsiness_Detection,
  author = {Bahadur, Akshay},
  journal = {https://github.com/akshaybahadur21/Drowsiness_Detection},
  month = {01},
  title = {{Drowsiness\_Detection}},
  year = {2018}
}
```

## References
- Adrian Rosebrock, [PyImageSearch Blog: Drowsiness Detection with OpenCV](https://www.pyimagesearch.com/2017/05/08/drowsiness-detection-opencv/)
