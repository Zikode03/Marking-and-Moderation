"""Hold an OS file lock while a local training subprocess owns the compute slot."""
import os
from filelock import FileLock
from ai_training.pipeline import main

if __name__ == '__main__':
    with FileLock(os.environ['PROSPERA_STUDIO_WORKER_LOCK'], timeout=0):
        main()
