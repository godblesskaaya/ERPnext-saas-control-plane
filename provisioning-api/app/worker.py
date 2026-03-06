from rq import Worker

from app.queue.redis import get_redis_connection


if __name__ == "__main__":
    connection = get_redis_connection()
    worker = Worker(["provisioning"], connection=connection)
    worker.work()
