import sys
from rembg import remove
from PIL import Image

input_path = r"C:\Users\Spandan\.gemini\antigravity-ide\brain\7e408caa-fa0c-4331-8430-37141a9e367a\low_poly_earth_1781804550515.png"
output_path = r"C:\Users\Spandan\OneDrive\Desktop\Codes\civicshield-ai\frontend\public\textures\custom_planet.png"

input_image = Image.open(input_path)
output_image = remove(input_image)
output_image.save(output_path)
print("Done")
