from app import models
from app.database import SessionLocal


def delete_all_guardians():
    database = SessionLocal()

    try:
        guardian_count = (
            database.query(models.Guardian).count()
        )

        relationship_count = (
            database.query(
                models.GuardianStudentLink
            ).count()
        )

        request_count = (
            database.query(
                models.DormAccessRequest
            ).count()
        )

        # حذف طلبات الخروج المرتبطة بأولياء الأمور
        database.query(
            models.DormAccessRequest
        ).delete(synchronize_session=False)

        # الاحتفاظ بسجلات الدخول والخروج،
        # لكن إزالة مرجع ولي الأمر منها
        database.query(
            models.EntryExitRecord
        ).update(
            {
                models.EntryExitRecord.guardian_id:
                    None
            },
            synchronize_session=False,
        )

        # حذف العلاقات بين الطالبات والأهالي
        database.query(
            models.GuardianStudentLink
        ).delete(synchronize_session=False)

        # حذف جميع أولياء الأمور
        database.query(
            models.Guardian
        ).delete(synchronize_session=False)

        database.commit()

        print("All guardians deleted successfully.")
        print(
            f"Deleted guardians: {guardian_count}"
        )
        print(
            "Deleted guardian relationships: "
            f"{relationship_count}"
        )
        print(
            f"Deleted access requests: {request_count}"
        )
        print("Students were not deleted.")

    except Exception:
        database.rollback()
        raise

    finally:
        database.close()


if __name__ == "__main__":
    delete_all_guardians()