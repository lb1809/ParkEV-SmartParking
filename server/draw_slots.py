import cv2
import json

video_path = r"D:\ParkEV-SmartParking\server\videos_extracted\D8_S20260323100000_E20260323100730.mp4"
polygons = []
current_polygon = []

def mouse_click(event, x, y, flags, param):
    global current_polygon, polygons, frame, clone
    if event == cv2.EVENT_LBUTTONDOWN:
        current_polygon.append((x, y))
        cv2.circle(frame, (x, y), 6, (0, 0, 255), -1)  # Draw red dot where clicked
        
        # Draw line to previous point
        if len(current_polygon) > 1:
            cv2.line(frame, current_polygon[-2], current_polygon[-1], (0, 255, 0), 2)
            
    # Right-Click = Close Polygon
    elif event == cv2.EVENT_RBUTTONDOWN:
        if len(current_polygon) >= 3:
            # Close the polygon outline
            cv2.line(frame, current_polygon[-1], current_polygon[0], (0, 255, 0), 2)
            polygons.append(current_polygon.copy())
            
            # Label it
            cx = sum(p[0] for p in current_polygon) // len(current_polygon)
            cy = sum(p[1] for p in current_polygon) // len(current_polygon)
            cv2.putText(frame, f"Slot {len(polygons)}", (cx-30, cy), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 0), 2)
            print(f"Slot {len(polygons)} configured with {len(current_polygon)} points!")
            
            current_polygon = [] # Reset for the next slot
        else:
            print("Need at least 3 points to form a polygon. Click more points.")
            
        cv2.imshow("Draw Slots (Press 'q' when finished)", frame)

cap = cv2.VideoCapture(video_path)
ret, frame = cap.read()
cap.release()

if ret:
    # 4K resolution (3840x2160) is too large for most monitors. We will shrink it visually 
    # to fit on your screen, but save the real math back in 4K format!
    h, w = frame.shape[:2]
    # Target visual size (approx 720p height)
    scale = min(1280/w, 720/h)
    new_w, new_h = int(w * scale), int(h * scale)
    frame = cv2.resize(frame, (new_w, new_h))
    
    clone = frame.copy()
    window_name = "Draw Slots (Press 'q' when finished)"
    cv2.namedWindow(window_name)
    cv2.setMouseCallback(window_name, mouse_click)

    print("==================================================")
    print(" INTERACTIVE SETUP WINDOW OPENED ON YOUR SCREEN")
    print("==================================================")
    print("INSTRUCTIONS:")
    print(" 1. Left-Click continuously around a car to form its border (you can trace curves!).")
    print(" 2. Right-Click when you reach the end to CLOSE and SAVE the shape.")
    print(" 3. Repeat this process for exactly 13 parking slots.")
    print(" 4. If you mess up, press 'r' to undo everything and restart.")
    print(" 5. When you are fully done drawn 13 slots, press 'q' to save & exit.")

    while True:
        cv2.imshow(window_name, frame)
        key = cv2.waitKey(1) & 0xFF
        # Press 'r' to reset
        if key == ord("r"):
            frame = clone.copy()
            polygons = []
            current_polygon = []
            print("Resetting drawing board...")
        # Press 'q' to quit and save
        elif key == ord("q"):
            break

    cv2.destroyAllWindows()
    
    # Scale polygons back up to absolute 4K coordinates
    inv_scale = 1.0 / scale
    real_polygons = []
    for poly in polygons:
        real_poly = [(int(x * inv_scale), int(y * inv_scale)) for (x, y) in poly]
        real_polygons.append(real_poly)
    
    # Save the coordinates to json for YOLO
    json_path = r"D:\ParkEV-SmartParking\server\parking_slots.json"
    with open(json_path, "w") as f:
        json.dump(real_polygons, f, indent=4)
        
    print(f"\nSUCCESS! Saved {len(real_polygons)} virtual parking slots to {json_path}!")
else:
    print("Failed to read video format.")
