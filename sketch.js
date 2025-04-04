// Bluetooth UUIDs for micro:bit UART service
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

let bluetoothDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let isConnected = false;
let bluetoothStatus = "Disconnected";
let isSendingData = false; // 데이터 전송 상태 플래그
let lastSentTime = 0; // 마지막 데이터 전송 시간
const SEND_INTERVAL = 100; // 데이터 전송 최소 간격(ms)

// Video and ML variables
let video;
let detector;
let detections = [];
let selectedObject = "person"; // Default object for detection
let confidenceThreshold = 50; // Default confidence threshold
let isObjectDetectionActive = false; // Control for starting and stopping object detection

// Camera control variables
let facingMode = "user"; // Default to front camera
let isFlipped = false;   // 좌우 반전 상태

// UI elements
let flipButton, switchCameraButton, connectBluetoothButton, disconnectBluetoothButton;
let startDetectionButton, stopDetectionButton;
let objectSelect, confidenceSlider;
let confidenceLabel;
let dataDisplay;

function preload() {
  // Load COCO-SSD object detection model
  detector = ml5.objectDetector("cocossd");
}

function setup() {
  // 고정된 캔버스 크기 설정 (400x300)
  let canvas = createCanvas(400, 300);
  canvas.parent('p5-container');
  canvas.style('border-radius', '20px');
  
  // Setup video capture
  setupCamera();

  // Create UI
  createUI();
}

function setupCamera() {
  video = createCapture({
    video: {
      facingMode: facingMode,
      width: 400,  // 고정 폭
      height: 300 // 고정 높이
    }
  });
  video.size(400, 300);
  video.hide();
}

function createUI() {
  // Data display area
  dataDisplay = select('#dataDisplay');
  dataDisplay.html("마이크로비트로 전송된 데이터: 없음");

  // Camera control buttons
  flipButton = createButton("↔️ 카메라 좌우 반전");
  flipButton.parent('camera-control-buttons');
  flipButton.mousePressed(toggleFlip);

  switchCameraButton = createButton("🔄 전후방 카메라 전환");
  switchCameraButton.parent('camera-control-buttons');
  switchCameraButton.mousePressed(switchCamera);

  // Bluetooth control buttons
  connectBluetoothButton = createButton("🔗 블루투스 연결");
  connectBluetoothButton.parent('bluetooth-control-buttons');
  connectBluetoothButton.mousePressed(connectBluetooth);

  disconnectBluetoothButton = createButton("❌ 블루투스 연결 해제");
  disconnectBluetoothButton.parent('bluetooth-control-buttons');
  disconnectBluetoothButton.mousePressed(disconnectBluetooth);

  // Object selection dropdown
  objectSelect = createSelect();
  objectSelect.parent('object-select-container');

  // COCO-SSD 객체 목록 추가
  const objectList = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
    "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard",
    "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "TV", "laptop", "mouse", "remote", "keyboard",
    "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase",
    "scissors", "teddy bear", "hair drier", "toothbrush"
  ];

  objectList.forEach((item) => {
    objectSelect.option(item);
  });

  objectSelect.changed(() => {
    selectedObject = objectSelect.value();
  });

  // Confidence slider
  confidenceSlider = createSlider(0, 100, 50);
  confidenceSlider.parent('confidence-container');
  confidenceSlider.input(() => {
    confidenceThreshold = confidenceSlider.value();
    confidenceLabel.html(`Confidence: ${confidenceThreshold}%`);
  });

  confidenceLabel = createDiv(`Confidence: ${confidenceThreshold}%`);
  confidenceLabel.parent('confidence-container');

  // Object detection control buttons
  startDetectionButton = createButton("🟢 사물 인식 시작");
  startDetectionButton.parent('object-control-buttons');
  startDetectionButton.id('startDetectionButton');
  startDetectionButton.mousePressed(() => {
    if (!isConnected) {
      alert("블루투스가 연결되어 있지 않습니다. 블루투스를 연결하세요.");
      return;
    }
    startObjectDetection();
  });

  stopDetectionButton = createButton("🔴 사물 인식 중지");
  stopDetectionButton.parent('object-control-buttons');
  stopDetectionButton.id('stopDetectionButton');
  stopDetectionButton.mousePressed(() => {
    stopObjectDetection();
    sendBluetoothData("stop"); // Stop 신호 전송
  });

  // 초기 블루투스 상태 업데이트
  updateBluetoothStatus();
}

function toggleFlip() {
  isFlipped = !isFlipped;
}

function switchCamera() {
  facingMode = facingMode === "user" ? "environment" : "user";
  video.remove();
  setupCamera();
}

function startObjectDetection() {
  isObjectDetectionActive = true;
  detector.detect(video, gotDetections); // Start detecting
}

function stopObjectDetection() {
  isObjectDetectionActive = false;
  detections = []; // Clear detections
}

function gotDetections(error, results) {
  if (error) {
    console.error(error);
    return;
  }
  detections = results;
  if (isObjectDetectionActive) {
    detector.detect(video, gotDetections); // Continue detecting
  }
}

function draw() {
  background(220);

  if (isFlipped) {
    push();
    translate(width, 0);
    scale(-1, 1);
    image(video, 0, 0, width, height);
    pop();
  } else {
    image(video, 0, 0, width, height);
  }

  if (isObjectDetectionActive) {
    let highestConfidenceObject = null;
    let detectedCount = 0; // 객체 개수 카운트

    // 여러 객체에 대해 가장 신뢰도가 높은 객체 찾기
    detections.forEach((object) => {
      if (object.label === selectedObject && object.confidence * 100 >= confidenceThreshold) {
        if (!highestConfidenceObject || object.confidence > highestConfidenceObject.confidence) {
          highestConfidenceObject = object;
        }
        detectedCount++; // 인식된 객체 개수 증가
      }
    });

    // 여러 객체에 대해서 각각 바운딩 박스를 그리되, 가장 신뢰도가 높은 객체는 파란색 바운딩 박스를 그림
    detections.forEach((object) => {
      if (object.label === selectedObject && object.confidence * 100 >= confidenceThreshold) {
        // 좌우 반전 고려하여 좌표 조정
        let x = isFlipped ? width - object.x - object.width : object.x;
        let y = object.y;
        let w = object.width;
        let h = object.height;

        // 신뢰도가 가장 높은 객체는 파란색 바운딩 박스
        if (object === highestConfidenceObject) {
          stroke(0, 0, 255);  // 파란색
        } else {
          stroke(0, 255, 0);  // 다른 객체는 초록색
        }
        strokeWeight(2);
        noFill();
        rect(x, y, w, h);

        noStroke();
        fill(255);
        textSize(16);
        text(
          `${object.label} (${(object.confidence * 100).toFixed(1)}%)`,
          x + 10,
          y + 20
        );

        // 감지된 객체 데이터 전송 및 디스플레이 업데이트 (반전된 좌표 사용)
        const centerX = isFlipped ? width - (object.x + object.width / 2) : object.x + object.width / 2;
        const centerY = object.y + object.height / 2;
        const data = `x${Math.round(centerX)}y${Math.round(centerY)}w${Math.round(w)}h${Math.round(h)}d${detectedCount}`;
        sendBluetoothData(centerX, centerY, w, h, detectedCount);
        dataDisplay.html(`마이크로비트로 전송된 데이터: ${data}`);
      }
    });

    // 감지된 객체가 없을 경우 null 데이터를 전송
    if (!highestConfidenceObject) {
      sendBluetoothData(null); // null 데이터 전송
      dataDisplay.html("마이크로비트로 전송된 데이터: 없음");
    }
  }
}

async function connectBluetooth() {
  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "BBC micro:bit" }],
      optionalServices: [UART_SERVICE_UUID]
    });

    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(UART_SERVICE_UUID);
    rxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
    txCharacteristic = await service.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
    txCharacteristic.startNotifications();

    isConnected = true;
    bluetoothStatus = `Connected to ${bluetoothDevice.name}`;
  } catch (error) {
    console.error("Bluetooth connection failed:", error);
    bluetoothStatus = "Connection Failed";
  }
  updateBluetoothStatus();
}

function disconnectBluetooth() {
  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
    bluetoothDevice.gatt.disconnect();
    isConnected = false;
    bluetoothStatus = "Disconnected";
    rxCharacteristic = null;
    txCharacteristic = null;
    bluetoothDevice = null;
  } else {
    bluetoothStatus = "Already Disconnected";
  }
  updateBluetoothStatus();
}

function updateBluetoothStatus() {
  const statusElement = select("#bluetoothStatus");
  statusElement.html(`상태: ${bluetoothStatus}`);
  if (isConnected) {
    statusElement.style('background-color', '#d0f0fd'); // 연결됨: 연한 파랑
    statusElement.style('color', '#FE818D');
  } else {
    statusElement.style('background-color', '#f9f9f9'); // 연결 안 됨: 회색
    statusElement.style('color', '#FE818D');
  }
}

async function sendBluetoothData(x, y, width, height, detectedCount) {
  if (!rxCharacteristic || !isConnected) {
    console.error("Cannot send data: Device not connected.");
    return;
  }

  if (isSendingData) {
    console.warn("Data transmission already in progress. Waiting...");
    return;
  }

  try {
    isSendingData = true; // 데이터 전송 시작

    // 'stop' 신호 전송 처리
    if (x === "stop") {
      const stopData = `stop\n`;
      const encoder = new TextEncoder();
      const encodedStopData = encoder.encode(stopData);
      await rxCharacteristic.writeValue(encodedStopData);
      console.log("Sent: stop");
      return;
    }

    // null 데이터 처리 (사물이 인식되지 않은 경우)
    if (x === null) {
      const nullData = `null\n`;
      const encoder = new TextEncoder();
      const encodedNullData = encoder.encode(nullData);
      await rxCharacteristic.writeValue(encodedNullData);
      console.log("Sent: null");
      return;
    }

    // 감지된 사물이 있을 때만 데이터 전송
    if (detectedCount > 0) {
      const data = `x${Math.round(x)}y${Math.round(y)}w${Math.round(width)}h${Math.round(height)}d${detectedCount}\n`;
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(data);

      await rxCharacteristic.writeValue(encodedData);
      console.log("Sent:", data);
    }
  } catch (error) {
    console.error("Error sending data:", error);
  } finally {
    isSendingData = false; // 데이터 전송 완료
  }
}
