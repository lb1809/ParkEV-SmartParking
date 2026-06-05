import cv2
import json
import numpy as np
from ultralytics import YOLO
import sys

# Load your 13 drawn virtual parking coordinates
with open(r"D:\ParkEV-SmartParking\server\parking_slots.json", "r") as f:
    slots = json.load(f)

# Convert arrays for fast OpenCV polygon math
np_slots = [np.array(pts, np.int32) for pts in slots]

print("Downloading YOLOv8 model... (This may take a moment on first run)")
# Load YOLOv8 model (Nano version for fast CPU/Stream processing)
model = YOLO("yolov8n.pt")

video_path = r"D:\ParkEV-SmartParking\server\videos_extracted\D8_S20260323100000_E20260323100730.mp4"
cap = cv2.VideoCapture(video_path)

if not cap.isOpened():
    print("FATAL ERROR: Could not open video file.")
    sys.exit()

print("══════════════════════════════════════════════════")
print("🔥 LIVE YOLOv8 TRACKING PREVIEW ENGAGED!")
print("══════════════════════════════════════════════════")
print("We mapped 13 custom grid points. Now processing AI framework.")
print("> Press 'Q' on the video window to shut it down when satisfied.")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        print("End of video stream reached.")
        break

    # Assume all slots are vacant for this frame initially
    current_occupancy = {i: False for i in range(len(np_slots))}

    # Run YOLO - predicting only 'car' (2), 'motorcycle' (3), 'bus' (5), 'truck' (7) to ignore humans/trees
    results = model(frame, classes=[2, 3, 5, 7], verbose=False)
    
    # Process detections
    for result in results:
        boxes = result.boxes
        for box in boxes:
            # Only trust detections above 40% confidence to filter out ghost objects
            conf = float(box.conf[0].cpu().numpy())
            if conf < 0.40:
                continue

            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            
            # We track the ABSOLUTE CENTER (centroid) of the car bounding box
            # This prevents shadows (which lower y2) from breaking the placement math
            cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)
            
            # Draw a purple dot on the detected vehicle center
            cv2.circle(frame, (cx, cy), 8, (255, 0, 255), -1)

            # Intersection Math: Check if this tire-center sits inside any of your 13 drawn polygons!
            for slot_id, poly in enumerate(np_slots):
                if cv2.pointPolygonTest(poly, (cx, cy), False) >= 0:
                    current_occupancy[slot_id] = True
                    break # Car found in this slot
    
    # Render polygons and occupancy state dynamically!
    for slot_id, poly in enumerate(np_slots):
        # RED for Occupied. GREEN for Vacant!
        color = (0, 0, 255) if current_occupancy[slot_id] else (0, 255, 0)
        cv2.polylines(frame, [poly], isClosed=True, color=color, thickness=4)
        
        # Add labels S1, S2, etc..
        label_pos = tuple(poly[0])
        cv2.putText(frame, f"S{slot_id+1}", (label_pos[0]-10, label_pos[1]-10), cv2.FONT_HERSHEY_DUPLEX, 1.2, color, 2)

    # Resize frame purely for your local preview monitor!
    h, w = frame.shape[:2]
    scale = min(1280 / w, 720 / h)
    frame_resized = cv2.resize(frame, (int(w * scale), int(h * scale)))
    
    cv2.imshow("YOLOv8 AI Parking Tracker (Press 'q' to stop)", frame_resized)
    
    # Refresh screen
    if cv2.waitKey(1) & 0xFF == ord('q'):
        print("User requested shutdown.")
        break

cap.release()
cv2.destroyAllWindows()
