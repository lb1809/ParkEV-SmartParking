import cv2
import os

video_path = r"D:\ParkEV-SmartParking\server\videos_extracted\D8_S20260323100000_E20260323100730.mp4"

def test_video():
    if not os.path.exists(video_path):
        print(f"ERROR: Cannot find video at {video_path}")
        return

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"ERROR: Found file, but OpenCV cannot open it: {video_path}")
        return

    ret, frame = cap.read()
    if not ret:
        print("ERROR: Successfully opened, but cannot read the first frame.")
        return

    # Info gathering
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps if fps > 0 else 0
    height, width, _ = frame.shape
    
    print("SUCCESS: Video loaded successfully!")
    print(f"Resolution: {width}x{height}")
    print(f"FPS: {fps}")
    print(f"Duration: {duration:.2f} seconds")
    print(f"Total Frames: {frame_count}")

    # Save artifact frame
    out_path = r"D:\ParkEV-SmartParking\server\snapshot_frame.jpg"
    cv2.imwrite(out_path, frame)
    print(f"Saved snapshot to {out_path}")
    
    cap.release()

if __name__ == "__main__":
    test_video()
