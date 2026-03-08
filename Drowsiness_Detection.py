# Drowsiness_Detection.py
from scipy.spatial import distance
from imutils import face_utils
import imutils
import dlib
import cv2
import winsound  # ✅ Added for beep sound on Windows

def eye_aspect_ratio(eye):
	A = distance.euclidean(eye[1], eye[5])
	B = distance.euclidean(eye[2], eye[4])
	C = distance.euclidean(eye[0], eye[3])
	ear = (A + B) / (2.0 * C)
	return ear
