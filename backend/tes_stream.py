import cv2
import subprocess

VIDEO_PATH = "rtsps://192.168.199.9:7441/sKDBmnGEmed2VzuM?enableSrtp"
subprocess.run(["ffplay", "-i", VIDEO_PATH])

VIDEO_PATH = "rtsps://192.168.199.9:7441/sKDBmnGEmed2VzuM?enableSrtp"
cap = cv2.VideoCapture(VIDEO_PATH, cv2.CAP_FFMPEG)
if not cap.isOpened():
    print("Gagal RTSPS. Cek SRTP. Detail:", str(cv2.error))
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 10000)
    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
    if not cap.isOpened():
        print("Masih gagal RTSPS. Coba RTSP...")
        VIDEO_PATH = "rtsp://192.168.199.9:7447/sKDBmnGEmed2VzuM"
        cap = cv2.VideoCapture(VIDEO_PATH, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            print("Masih gagal RTSP. Minta URL valid ke mentor.")
            print("Backend:", cap.get(cv2.CAP_PROP_BACKEND))
            print("Error code:", cap.get(cv2.CAP_PROP_POS_FRAMES))  # Cek error
        else:
            print("RTSP berhasil!")
    else:
        print("RTSPS berhasil setelah adjust!")
else:
    print("RTSPS berhasil langsung!")
ret, frame = cap.read()
if ret:
    print("Stream OK! Resolusi:", frame.shape)
else:
    print("Gagal membaca frame. Error:", cap.get(cv2.CAP_PROP_POS_FRAMES))
cap.release()