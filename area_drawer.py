# program untuk menggambar area khusus (ROI) custom pada gambar CCTV

import tkinter as tk
from tkinter import filedialog, messagebox
from PIL import Image, ImageTk
import json
import cv2
import numpy as np

class EnhancedAreaDrawerGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Enhanced Custom Area Drawing Tool for CCTV ROI")

        # Initialize variables
        self.image_path = None
        self.image = None
        self.photo = None
        self.current_points = []  # Temporary points for current area/line
        self.areas = []  # List of areas/lines, each {'type': 'polygon' or 'line', 'points': [], 'canvas_ids': {'lines': [], 'points': [], 'fill': None, 'labels': []}}
        self.current_canvas_ids = {'lines': [], 'points': [], 'fill': None, 'labels': []}
        self.current_type = 'polygon'  # 'polygon' or 'line'

        # Create GUI elements
        self.create_widgets()

    def create_widgets(self):
        # Top frame for buttons
        self.button_frame = tk.Frame(self.root)
        self.button_frame.pack(pady=5)

        # Load Image Button
        self.load_btn = tk.Button(
            self.button_frame,
            text="Load Image",
            command=self.load_image
        )
        self.load_btn.pack(side=tk.LEFT, padx=5)

        # Save All Areas/Lines Button
        self.save_btn = tk.Button(
            self.button_frame,
            text="Save All Areas/Lines",
            command=self.save_coordinates,
            state=tk.DISABLED
        )
        self.save_btn.pack(side=tk.LEFT, padx=5)

        # Close Current Button
        self.close_current_btn = tk.Button(
            self.button_frame,
            text="Close & Save Current Area/Line",
            command=self.close_current,
            state=tk.DISABLED
        )
        self.close_current_btn.pack(side=tk.LEFT, padx=5)

        # Clear Last Point Button
        self.clear_last_point_btn = tk.Button(
            self.button_frame,
            text="Clear Last Point",
            command=self.clear_last_point,
            state=tk.DISABLED
        )
        self.clear_last_point_btn.pack(side=tk.LEFT, padx=5)

        # Clear All Points Button
        self.clear_all_points_btn = tk.Button(
            self.button_frame,
            text="Clear All Points",
            command=self.clear_all_points,
            state=tk.DISABLED
        )
        self.clear_all_points_btn.pack(side=tk.LEFT, padx=5)

        # Type Selector (Polygon or Line)
        self.type_var = tk.StringVar(value='polygon')
        self.polygon_radio = tk.Radiobutton(
            self.button_frame,
            text="Polygon",
            variable=self.type_var,
            value='polygon'
        )
        self.polygon_radio.pack(side=tk.LEFT, padx=5)

        self.line_radio = tk.Radiobutton(
            self.button_frame,
            text="Line",
            variable=self.type_var,
            value='line'
        )
        self.line_radio.pack(side=tk.LEFT, padx=5)

        # Area counter label
        self.area_counter = tk.Label(
            self.button_frame,
            text="Areas/Lines: 0 (Current Points: 0)",
            padx=10
        )
        self.area_counter.pack(side=tk.LEFT)

        # Canvas for image and drawing
        self.canvas = tk.Canvas(self.root)
        self.canvas.pack(expand=True, fill=tk.BOTH, padx=10, pady=5)

        # Instructions label
        self.instructions = tk.Label(
            self.root,
            text="Create: Left-click to add points. Use 'Close & Save Current Area/Line' to connect first and last point and save. Use Clear Last Point to remove the most recent point, Clear All Points to start over for current area/line.",
            wraplength=600
        )
        self.instructions.pack(pady=5)

        # Bind mouse events
        self.canvas.bind("<ButtonPress-1>", self.on_left_click)

    def load_image(self):
        self.image_path = filedialog.askopenfilename(
            filetypes=[("Image files", "*.jpg *.jpeg *.png *.bmp *.gif *.tiff")]
        )

        if self.image_path:
            self.image = Image.open(self.image_path)

            # Get window size
            window_width = self.root.winfo_width()
            window_height = self.root.winfo_height()

            # Calculate scaling factor
            image_ratio = self.image.width / self.image.height
            window_ratio = window_width / window_height

            if window_ratio > image_ratio:
                new_height = window_height - 100
                new_width = int(new_height * image_ratio)
            else:
                new_width = window_width - 20
                new_height = int(new_width / image_ratio)

            self.image = self.image.resize((new_width, new_height), Image.Resampling.LANCZOS)
            self.photo = ImageTk.PhotoImage(self.image)

            self.canvas.config(width=new_width, height=new_height)
            self.canvas.create_image(0, 0, anchor=tk.NW, image=self.photo)

            self.save_btn.config(state=tk.NORMAL)
            self.clear_last_point_btn.config(state=tk.NORMAL)
            self.clear_all_points_btn.config(state=tk.NORMAL)
            self.close_current_btn.config(state=tk.DISABLED)

    def on_left_click(self, event):
        self.current_type = self.type_var.get()
        if self.current_type == 'line' and len(self.current_points) >= 2:
            return

        self.current_points.append((event.x, event.y))
        point_id = self.canvas.create_oval(event.x-3, event.y-3, event.x+3, event.y+3, fill="red")
        label_id = self.canvas.create_text(event.x, event.y-10, text=str(len(self.current_points)), fill="blue")
        self.current_canvas_ids['points'].append(point_id)
        self.current_canvas_ids['labels'].append(label_id)

        if len(self.current_points) > 1:
            prev_point = self.current_points[-2]
            line_id = self.canvas.create_line(prev_point[0], prev_point[1], event.x, event.y, fill="red", width=2)
            self.current_canvas_ids['lines'].append(line_id)

        # Enable Close Current if enough points
        if len(self.current_points) >= 3 or (self.current_type == 'line' and len(self.current_points) == 2):
            self.close_current_btn.config(state=tk.NORMAL)

        self.update_counter()

    def close_current(self):
        if self.current_type == 'polygon' and len(self.current_points) >= 3:
            # Auto connect to first point
            first_point = self.current_points[0]
            line_id = self.canvas.create_line(
                self.current_points[-1][0], self.current_points[-1][1],
                first_point[0], first_point[1],
                fill="red", width=2
            )
            self.current_canvas_ids['lines'].append(line_id)

            # Fill semi-transparent
            fill_id = self.canvas.create_polygon(self.current_points, fill="blue", stipple="gray50", outline="red", width=2)
            self.current_canvas_ids['fill'] = fill_id

        elif self.current_type == 'line' and len(self.current_points) == 2:
            pass  # No fill for line

        # Store area/line
        self.areas.append({
            'type': self.current_type,
            'points': self.current_points.copy(),
            'canvas_ids': self.current_canvas_ids.copy()
        })

        # Reset current
        self.current_points = []
        self.current_canvas_ids = {'lines': [], 'points': [], 'fill': None, 'labels': []}
        self.close_current_btn.config(state=tk.DISABLED)

        self.update_counter()

    def clear_last_point(self):
        if self.current_points:
            self.current_points.pop()
            point_id = self.current_canvas_ids['points'].pop()
            label_id = self.current_canvas_ids['labels'].pop()
            self.canvas.delete(point_id)
            self.canvas.delete(label_id)
            if self.current_canvas_ids['lines']:
                line_id = self.current_canvas_ids['lines'].pop()
                self.canvas.delete(line_id)

            # Disable Close if not enough points
            if len(self.current_points) < 3 and self.current_type == 'polygon':
                self.close_current_btn.config(state=tk.DISABLED)
            elif len(self.current_points) < 2 and self.current_type == 'line':
                self.close_current_btn.config(state=tk.DISABLED)

        self.update_counter()

    def clear_all_points(self):
        # Clear current points and canvas items
        for line_id in self.current_canvas_ids['lines']:
            self.canvas.delete(line_id)
        for point_id in self.current_canvas_ids['points']:
            self.canvas.delete(point_id)
        for label_id in self.current_canvas_ids['labels']:
            self.canvas.delete(label_id)
        if self.current_canvas_ids.get('fill'):
            self.canvas.delete(self.current_canvas_ids['fill'])

        self.current_points = []
        self.current_canvas_ids = {'lines': [], 'points': [], 'fill': None, 'labels': []}
        self.close_current_btn.config(state=tk.DISABLED)

        self.update_counter()

    def update_counter(self):
        self.area_counter.config(text=f"Areas/Lines: {len(self.areas)} (Current Points: {len(self.current_points)})")

    def save_coordinates(self):
        if not self.areas:
            messagebox.showwarning(
                "Warning",
                "Please draw at least one area/line first!"
            )
            return

        if self.image_path:
            original_img = cv2.imread(self.image_path)
            orig_height, orig_width = original_img.shape[:2]
            scale_x = orig_width / self.image.width
            scale_y = orig_height / self.image.height

            items_data = []
            for i, area in enumerate(self.areas, 1):
                original_points = [(int(point[0] * scale_x), int(point[1] * scale_y)) for point in area['points']]
                items_data.append({
                    'item_number': i,
                    'type': area['type'],
                    'points': original_points
                })

            coordinates = {
                'items': items_data,
                'image_width': orig_width,
                'image_height': orig_height
            }

            save_path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON files", "*.json")])
            if save_path:
                with open(save_path, 'w') as f:
                    json.dump(coordinates, f, indent=2)
                messagebox.showinfo("Success", f"All coordinates saved to {save_path}")

def main():
    root = tk.Tk()
    app = EnhancedAreaDrawerGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()