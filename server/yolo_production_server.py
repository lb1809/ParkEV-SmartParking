import cv2
import json
import numpy as np
import requests
import time
import threading
from flask import Flask, Response
from ultralytics import YOLO

app = Flask(__name__)
latest_frame = None

def generate_frames():
    global latest_frame
    while True:
        if latest_frame is None:
            time.sleep(0.1)
            continue
            
        ret, buffer = cv2.imencode('.jpg', latest_frame)
        if not ret:
            continue
            
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/camera_feed')
def camera_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

def yolo_engine():
    global latest_frame
    print("Loading mapped parking coordinates...")
    try:
        with open(r"D:\ParkEV-SmartParking\server\parking_slots.json", "r") as f:
            slots = json.load(f)
    except FileNotFoundError:
        print("ERROR: Run draw_slots.py first!")
        return

    np_slots = [np.array(pts, np.int32) for pts in slots]
    
    print("Initializing YOLOv8 Neural Engine...")
    model = YOLO("yolov8n.pt")
    cap = cv2.VideoCapture(r"D:\ParkEV-SmartParking\server\videos_extracted\D8_S20260323100000_E20260323100730.mp4")

    last_sync_time = 0
    last_state = []
    
    print("==================================================")
    print("🚀 YOLO PRODUCTION ENGINE ONLINE")
    print("📡 Local Dashboard Feed: http://localhost:5000/camera_feed")
    print("🔄 Pumping API Data to Node.js backend...")
    print("==================================================")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            # Video ended? Loop back for continuous dashboard tracking
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        occupancy = [False] * len(np_slots)
        results = model(frame, classes=[2, 3, 5, 7], imgsz=1280, verbose=False)
        
        for result in results:
            boxes = result.boxes
            for box in boxes:
                conf = float(box.conf[0].cpu().numpy())
                if conf < 0.20:  # Dropped from 40% to 20% to catch angled physics
                    continue
                
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)
                
                # We check multiple physical nodes of the car so if they drew a small box it still hits
                car_nodes = [
                    (cx, cy),
                    (cx, int(y1 + (y2-y1)*0.25)), # Top hood
                    (cx, int(y1 + (y2-y1)*0.75)), # Bottom trunk
                    (int(x1 + (x2-x1)*0.25), cy), # Left door
                    (int(x1 + (x2-x1)*0.75), cy)  # Right door
                ]

                for p in car_nodes:
                    cv2.circle(frame, p, 5, (255, 0, 255), -1)

                matched = False
                for slot_id, poly in enumerate(np_slots):
                    for p in car_nodes:
                        if cv2.pointPolygonTest(poly, p, False) >= 0:
                            occupancy[slot_id] = True
                            matched = True
                            break
                    if matched: break
                        
        for slot_id, poly in enumerate(np_slots):
            color = (0, 0, 255) if occupancy[slot_id] else (0, 255, 0)
            cv2.polylines(frame, [poly], isClosed=True, color=color, thickness=4)
            label_pos = tuple(poly[0])
            cv2.putText(frame, f"S{slot_id+1}", (label_pos[0]-10, label_pos[1]-10), cv2.FONT_HERSHEY_DUPLEX, 1.2, color, 2)
            
        display_frame = cv2.resize(frame, (1920, 1080))
        latest_frame = display_frame
        
        current_time = time.time()
        if occupancy != last_state or (current_time - last_sync_time) > 2.0:
            last_state = occupancy.copy()
            last_sync_time = current_time
            def send_sync(occ):
                try:
                    requests.post('http://localhost:3001/api/slots/vision-sync', json={'occupancy': occ}, timeout=1)
                except requests.exceptions.RequestException:
                    pass
            threading.Thread(target=send_sync, args=(occupancy,), daemon=True).start() 

if __name__ == "__main__":
    t = threading.Thread(target=yolo_engine)
    t.daemon = True
    t.start()
    app.run(host='0.0.0.0', port=5000, threaded=True, use_reloader=False)
