# Face engine setup

The website camera runs in the browser, so the same workflow works with a
phone, laptop, USB webcam, or Raspberry Pi 5 touchscreen camera. The captured
image is sent to this face engine for matching.

## Raspberry Pi 5

From the project folder, run:

```bash
chmod +x start_face_engine_pi.sh
./start_face_engine_pi.sh
```

If the backend is running on the same Raspberry Pi, set:

```bash
FACE_ENGINE_URL=http://127.0.0.1:8001/verify
```

If the backend is hosted on another computer or cloud service, the face engine
must be deployed at a reachable HTTPS URL and `FACE_ENGINE_URL` must point to
that URL. A Raspberry Pi's `127.0.0.1` address is only reachable from the Pi
itself.

## Windows

Install the face-engine dependencies once, then run `start_face_engine.bat`.
The existing `start_backend.bat` already points the local backend to
`http://127.0.0.1:8001/verify`.
