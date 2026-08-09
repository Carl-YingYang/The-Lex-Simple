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

    # 2. Apply Filters (Parang Adobe Scan)
    if filter_type == 'grayscale':
        processed_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
    elif filter_type == 'bw':
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Standard thresholding para maging pure black and white
        _, processed_img = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
        
    elif filter_type == 'magic':
        # Magic Color: Adaptive thresholding para matanggal ang shadows at ma-enhance ang text
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        processed_img = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
    else:
        # Default kung walang filter
        processed_img = img

    # 3. I-run ang OCR sa nilinis na image
    extracted_text = pytesseract.image_to_string(processed_img)
    
    return extracted_text.strip()