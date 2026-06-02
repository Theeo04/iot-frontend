# Build context = repo root, so both the Python app and the static frontend
# files (Dashboard.html, *.jsx) can be copied into the image.
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY services/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Python backend
COPY services/api/app/ ./api/

# Static frontend (served by the API at /)
COPY Dashboard.html ./static/
COPY *.jsx ./static/

ENV STATIC_DIR=/app/static

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
