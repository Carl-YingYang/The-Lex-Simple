import cv2
import numpy as np
import pytesseract
import re

# Ito yung path ng Tesseract sa Windows mo base sa screenshot mo
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

def sanitize_legal_text(text: str) -> str:
    """
    Nililinis ang extracted text (e.g., PII removal o whitespace formatting) bago ipasa sa AI.
    Kung may specific masking logic ka dito dati, pwede mong ibalik.
    """
    if not text:
        return ""
    # Basic cleanup: tinatanggal ang mga sobrang spaces o newlines
    clean_text = re.sub(r'\s+', ' ', text)
    return clean_text.strip()


def clean_and_extract_image(image_bytes: bytes, filter_type: str) -> str:
    """
    Tinatanggap ang raw image bytes, nililinis gamit ang OpenCV base sa filter,
    at ine-extract ang text gamit ang Tesseract OCR.
    """
    # 1. Convert bytes to OpenCV Image format (numpy array)
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return ""

    # 🚀 FIX 1: AUTO-RESIZE PARA SA PHONE CAMERAS
    # Iniiwasan mag-crash o malito ang Tesseract sa sobrang lalaking pictures
    height, width = img.shape[:2]
    max_dim = 1500
    if max(height, width) > max_dim:
        scale = max_dim / float(max(height, width))
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 2. Apply Filters (CamScanner / Adobe Scan Engine)
    if filter_type == 'grayscale':
        processed_img = gray
        
    elif filter_type == 'bw':
        # Gaussian blur + Otsu's threshold para malinis na black & white
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, processed_img = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
    elif filter_type == 'magic':
        # 🚀 FIX 2: ILLUMINATION NORMALIZATION (SHADOW REMOVAL)
        # Kukunin ang background (anino) at ibabawas sa image para pumuti ang papel
        dilated_img = cv2.dilate(gray, np.ones((7, 7), np.uint8))
        bg_img = cv2.medianBlur(dilated_img, 21)
        diff_img = 255 - cv2.absdiff(gray, bg_img)

        # I-normalize para umangat ang contrast
        norm_img = cv2.normalize(diff_img, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX, dtype=cv2.CV_8UC1)

        # Adaptive thresholding na may mas malaking block size (51) para hindi mabura ang loob ng text
        processed_img = cv2.adaptiveThreshold(
            norm_img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 15
        )
    else:
        # Default kung walang filter
        processed_img = gray

    # 🚀 FIX 3: TESSERACT CONFIGURATION
    # --psm 6: "Assume a single uniform block of text." Perfect para sa format ng contracts.
    custom_config = r'--oem 3 --psm 6'
    extracted_text = pytesseract.image_to_string(processed_img, config=custom_config)
    
    return extracted_text.strip()