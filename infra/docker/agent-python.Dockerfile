FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_CACHE_DIR=/envment/pip-cache
ENV PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple
ENV PIP_TRUSTED_HOST=mirrors.cloud.tencent.com

COPY apps/agent-python/requirements.txt apps/agent-python/requirements.txt
RUN pip install --no-input -r apps/agent-python/requirements.txt

COPY apps/agent-python apps/agent-python

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "app.main:app", "--app-dir", "apps/agent-python", "--host", "0.0.0.0", "--port", "8001"]
