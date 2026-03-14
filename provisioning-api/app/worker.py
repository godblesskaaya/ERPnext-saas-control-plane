from rq import Worker

from app.domains.observability import init_sentry
from app.queue.redis import get_redis_connection
from app.workers.dlq import on_job_failure


if __name__ == "__main__":
    init_sentry(include_fastapi=False, include_rq=True)
    connection = get_redis_connection()
    worker = Worker(["provisioning"], connection=connection, exception_handlers=[on_job_failure])
    worker.work()
