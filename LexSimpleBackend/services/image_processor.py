import cv2
import os

def clean_document_image(image_path: str) -> str:
    """
    Adobe Scan-style Auto-Clean.
    Kinukuha niya ang image, tinatanggal ang shadows/dilaw na papel,
    at ginagawang crisp black and white text para mas madali basahin ng OCR.
    """
    try:
        # Read image
        img = cv2.imread(image_path)
        if img is None:
            return image_path

        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Adaptive Thresholding (The "Magic Color" / B&W effect)
        # Matatanggal ang mga anino at uneven lighting
        clean_img = cv2.adaptiveThreshold(
            gray, 255, 
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )

        # Overwrite the original image with the cleaned one
        cv2.imwrite(image_path, clean_img)
        
        return image_path
    except Exception as e:
        print(f"Image Cleaning Error: {e}")
        return image_path